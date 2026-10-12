import { randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { openDb } from './db.js';
import { seedDemoHousehold } from './seed.js';
import { buildServer } from './mcp/server.js';
import { PARENT_HTML } from './parent/page.js';
import { activeHandoff, answerQuestionFromParent, contacts, currentContactFor, eveningLog, events, getQuestion, pendingQuestions } from './domain/house.js';

export interface AppOptions {
  dbPath?: string;
  parentKey?: string;
  escalateAfterMs?: number;
  host?: string;
  allowedHosts?: string[];
  publicUrl?: string;
  /** Browser origins allowed to call the server. Default: any (fine for local development). */
  allowedOrigins?: string[];
}

const MAX_SESSIONS = 200;
// Long enough for a quiet evening between questions.
const SESSION_IDLE_MS = 6 * 60 * 60 * 1000;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

function envMs(name: string, fallback: number) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 1000 ? v : fallback;
}

export function createApp(opts: AppOptions = {}) {
  const db = openDb(opts.dbPath ?? process.env.WYO_DB ?? ':memory:');
  seedDemoHousehold(db);
  // Tasks live in memory: after a restart nobody is waiting on these questions any more.
  db.prepare("UPDATE questions SET status = 'expired' WHERE status = 'pending' AND task_id IS NOT NULL").run();
  const taskStore = new InMemoryTaskStore();
  const parentKey = opts.parentKey ?? process.env.WYO_PARENT_KEY ?? 'demo-parent-key';
  const escalateAfterMs = opts.escalateAfterMs ?? envMs('WYO_ESCALATE_MS', 180_000);
  const allowedOrigins = opts.allowedOrigins ?? process.env.ALLOWED_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean);
  const publicUrl = opts.publicUrl ?? process.env.WYO_PUBLIC_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8787}`;

  let lastEmergency: { at: string; description: string } | null = null;
  events.on('emergency', (e) => (lastEmergency = e));
  events.on('handoff', () => (lastEmergency = null));

  const app = createMcpExpressApp({ host: opts.host ?? '127.0.0.1', allowedHosts: opts.allowedHosts });
  // Browsers may only call us from local pages (the simulator) or origins listed in ALLOWED_ORIGINS.
  // Requests without an Origin header (MCP clients, curl, same-origin page loads) are not affected.
  const originAllowed = (origin: string | undefined) =>
    !origin || (allowedOrigins?.length ? allowedOrigins.includes(origin) : LOCAL_ORIGIN.test(origin));

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!originAllowed(origin)) {
      // Stops any website the user happens to visit from driving the device or the parent API.
      return void res.status(403).json({ error: 'Origin not allowed' });
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Headers', 'content-type, mcp-session-id, mcp-protocol-version, last-event-id');
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
    next();
  });

  // ---------- MCP endpoint (Streamable HTTP) ----------
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const lastSeen = new Map<string, number>();
  // Close sessions that have gone quiet, so abandoned clients don't pile up.
  const sweeper = setInterval(() => {
    const cutoff = Date.now() - SESSION_IDLE_MS;
    for (const [id, seen] of lastSeen) {
      if (seen < cutoff) {
        lastSeen.delete(id);
        void sessions.get(id)?.close();
        sessions.delete(id);
      }
    }
  }, 60_000);
  sweeper.unref();

  app.post('/mcp', async (req, res) => {
    const sid = req.headers['mcp-session-id'] as string | undefined;
    try {
      let transport = sid ? sessions.get(sid) : undefined;
      if (!transport) {
        if (sid || !isInitializeRequest(req.body)) {
          res.status(sid ? 404 : 400).json({ jsonrpc: '2.0', error: { code: -32000, message: sid ? 'Session not found' : 'Bad request: initialize first' }, id: null });
          return;
        }
        if (sessions.size >= MAX_SESSIONS) {
          res.status(503).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Too many open sessions, try again shortly' }, id: null });
          return;
        }
        const t = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            sessions.set(id, t);
            lastSeen.set(id, Date.now());
          },
        });
        t.onclose = () => {
          if (t.sessionId) {
            sessions.delete(t.sessionId);
            lastSeen.delete(t.sessionId);
          }
        };
        await buildServer({ db, taskStore, escalateAfterMs, publicUrl }).connect(t);
        transport = t;
      }
      if (transport.sessionId) lastSeen.set(transport.sessionId, Date.now());
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error('MCP error', err);
      if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  });

  const bySession = async (req: express.Request, res: express.Response) => {
    const t = sessions.get(req.headers['mcp-session-id'] as string);
    if (!t) return void res.status(404).send('Session not found');
    if (t.sessionId) lastSeen.set(t.sessionId, Date.now());
    await t.handleRequest(req, res);
  };
  app.get('/mcp', bySession);
  app.delete('/mcp', bySession);

  // ---------- Parent phone page ----------
  const keyBuf = Buffer.from(parentKey);
  const authorised = (k: unknown) => {
    if (typeof k !== 'string') return false;
    const b = Buffer.from(k);
    return b.length === keyBuf.length && timingSafeEqual(b, keyBuf);
  };

  app.get('/parent', (_req, res) => void res.type('html').send(PARENT_HTML));

  app.get('/parent/api/state', (req, res) => {
    if (!authorised(req.query.k)) return void res.sendStatus(401);
    res.json({
      handoff: activeHandoff(db) ?? null,
      parents: contacts(db)
        .filter((c) => c.priority < 9)
        .map((c) => c.name),
      questions: pendingQuestions(db).map((q) => ({ ...q, contact: currentContactFor(db, q)?.name ?? null })),
      log: eveningLog(db),
      emergency: lastEmergency,
    });
  });

  app.post('/parent/api/answer', (req, res) => {
    const { k, id, answer, scope, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (!Number.isInteger(id) || typeof answer !== 'string' || !answer.trim()) return void res.status(400).json({ error: 'id and answer required' });
    if (answer.length > 1000) return void res.status(400).json({ error: 'answer too long' });
    const existing = getQuestion(db, id);
    if (!existing) return void res.status(404).json({ error: 'question not found' });
    if (existing.status !== 'pending') return void res.status(409).json({ error: `question already ${existing.status}`, question: existing });
    const name = typeof by === 'string' && by.trim() ? by.trim().slice(0, 40) : 'Parent';
    const q = answerQuestionFromParent(db, id, answer.trim(), name, scope === 'always' ? 'always' : 'tonight');
    res.json(q);
  });

  app.use('/static', express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.get('/health', (_req, res) => void res.json({ ok: true }));

  const close = () => {
    clearInterval(sweeper);
    taskStore.cleanup();
    for (const t of sessions.values()) void t.close();
  };
  return { app, db, taskStore, parentKey, close };
}

const entry = process.argv[1];
const isMain = Boolean(entry) && (import.meta.url === pathToFileURL(entry).href || /[\\/]src[\\/]index\.ts$/.test(entry));
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(process.env.HOST ?? '127.0.0.1');
  if (!local && (!process.env.WYO_PARENT_KEY || process.env.WYO_PARENT_KEY === 'demo-parent-key' || process.env.WYO_PARENT_KEY.length < 16)) {
    console.error('Refusing to start on a public address without a strong WYO_PARENT_KEY (16+ characters).');
    process.exit(1);
  }
  const host = process.env.HOST ?? '127.0.0.1';
  const { app, parentKey } = createApp({ host, allowedHosts: process.env.ALLOWED_HOSTS?.split(',').map((h) => h.trim()) });
  app.listen(port, host, () => {
    console.log(`While You're Out MCP server: http://${host}:${port}/mcp`);
    console.log(`Parent page: http://${host}:${port}/parent?k=${parentKey}`);
  });
}
