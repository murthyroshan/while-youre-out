import { PRIVACY, TERMS } from './legal.js';
import { connectPage } from './connect.js';
import { GUEST_HTML, GUEST_SW_JS } from './guest/page.js';
import { offlineGuides } from './domain/emergency.js';
import { beeNote, devices, houseTick, lockDoor, pushNotice, unlockDoor } from './domain/devices.js';
import { applyLogToPlan } from './domain/plan.js';
import { approveOrder, declineOrder, getOrder, latestOrder, type Order, OrderError, orderView } from './domain/orders.js';
import { SitterError, sitters, updateSitter } from './domain/sitters.js';
import { activePass, audit, auditLog, endPass, extendPass, latestPass, passByToken, passOpen, passTick, seen, type Pass } from './domain/pass.js';
import { briefing, createQuestion } from './domain/house.js';
import { tonightPlan } from './domain/plan.js';
import { isEmergency } from './domain/safety.js';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createHouses } from './houses.js';
import { addToShoppingList, shoppingList } from './domain/shopping.js';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import express from 'express';
import { hostHeaderValidation, localhostHostValidation } from '@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { openDb } from './db.js';
import { seedDemoHousehold } from './seed.js';
import { buildServer } from './mcp/server.js';
import { PARENT_HTML, SERVICE_WORKER_JS } from './parent/page.js';
import { createPush, isValidSubscription, type PushSender } from './domain/push.js';
import { consent, FamilyError, getFamily, pruneOld, recordConsent, resetToDemo, saveFamily, startFresh } from './domain/family.js';
import { homeScreen } from './domain/home.js';
import { approvePayment, createPayment, declinePayment, dollars, duration, payableHandoff, type Payment, PaymentError, paymentByToken } from './domain/payments.js';
import { payPage } from './parent/pay.js';
import { DEMO_MESSAGE_BYTES, listMessages, MAX_MESSAGE_BYTES, MessageError, messageMedia, removeMessage, saveMessage } from './domain/messages.js';
import { aiAllowed, pushTestAllowed, startHeavy } from './limits.js';
import { HOST_SYSTEM, ADDON_INSTRUCTIONS } from './ai/hostPrompt.js';
import { activeIncident, incidentView, latestIncident, markDoorUnlocked, markOnTheWay, stepIncident, type StepAction } from './domain/incident.js';
import { addVisitor, getDoorEvent, recordDoorEvent, removeVisitor, VisitorError, visitors } from './domain/door.js';
import { activeHandoff, answerQuestionFromParent, contacts, currentContactFor, eveningLog, events, getQuestion, pendingQuestions } from './domain/house.js';
import { geminiChat, geminiFromEnv, AiUnavailableError, type AiClient, type ChatRequest } from './ai/gemini.js';
import { decideProposal, importInfo, importNote, ImportError, IMAGE_TYPES, MAX_IMPORT_BYTES, pendingProposals, ProposalError } from './domain/houseBrain.js';
import { householdTz, visibleFacts } from './domain/house.js';
import { formatTime, localTime, now, resetClock, setDemoTime } from './clock.js';
import { busyUntil, getSetting, setBusy, setSetting, setShadowTopic, shadowOffTopics, SHADOW_TOPICS } from './domain/shadow.js';
import { latestDebrief, saveAnswerAsRule } from './domain/debrief.js';
import { summary, teachbackState } from './domain/teachback.js';

export interface AppOptions {
  dbPath?: string;
  parentKey?: string;
  escalateAfterMs?: number;
  /** How long a spoken note may take to read before the device answers anyway. */
  voiceWaitMs?: number;
  host?: string;
  allowedHosts?: string[];
  publicUrl?: string;
  /** Browser origins allowed to call the server. Default: local pages only. */
  allowedOrigins?: string[];
  /** AI client for House Brain. Default: Gemini from GEMINI_API_KEY. Tests pass a fake. */
  ai?: AiClient;
  /** Enables the demo clock endpoints. Default: WYO_DEMO=1. */
  demo?: boolean;
  /** Enables the simulator's LLM proxy. Default: on unless WYO_HOST_LLM=0. */
  hostLlm?: boolean;
  /** Chat function for the proxy. Default: Gemini. Tests pass a fake. */
  chat?: (req: ChatRequest) => Promise<{ parts: unknown[]; model: string }>;
  /** Sends Web Push messages. Default: the web-push library. Tests pass a fake. */
  pushSender?: PushSender;
}

const STARTED_AT = new Date().toISOString();
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
  const ai = opts.ai ?? geminiFromEnv();

  let lastEmergency: { at: string; description: string } | null = null;
  const onEmergency = (e: { at: string; description: string }) => (lastEmergency = e);
  const clearEmergency = () => (lastEmergency = null);
  events.on('emergency', onEmergency);
  events.on('handoff', clearEmergency);
  events.on('reset', clearEmergency);
  const onIncident = ({ change }: { change: string }) => change === 'resolved' && clearEmergency();
  events.on('incident', onIncident);
  const push = createPush(db, { sender: opts.pushSender, publicUrl, parentKey });

  // Same as the SDK's createMcpExpressApp, with our own host checks.
  const demo = opts.demo ?? process.env.WYO_DEMO === '1';
  const app = express();
  app.disable('x-powered-by');
  // Behind Render's proxy, the visitor's address is the one it forwards (for per-visitor limits).
  if (process.env.RENDER || process.env.WYO_TRUST_PROXY === '1') app.set('trust proxy', 1);
  const ipOf = (req: express.Request) => req.ip ?? 'unknown';
  // Big bodies (recordings, files) are read one or two at a time, and not while memory is high.
  const heavyBody: express.RequestHandler = (_req, res, next) => {
    const done = startHeavy();
    if (!done) return void res.status(503).json({ error: 'The demo is busy right now. Try again in a minute.' });
    res.on('close', done);
    next();
  };
  // The parent link carries its key in the URL and the pay link its token: never send either on as
  // a referrer. The parent and pay pages may only be framed by the simulator (no clickjacking).
  const framers = ["'self'", ...(allowedOrigins?.length ? allowedOrigins : ['http://127.0.0.1:*', 'http://localhost:*'])].join(' ');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (publicUrl.startsWith('https://')) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    if (/^\/(parent|pay)(\/|$)/.test(req.path) && !req.path.startsWith('/parent/api/')) res.setHeader('Content-Security-Policy', `frame-ancestors ${framers}`);
    next();
  });
  const bindHost = opts.host ?? '127.0.0.1';
  if (opts.allowedHosts) app.use(hostHeaderValidation(opts.allowedHosts));
  else if (['127.0.0.1', 'localhost', '::1'].includes(bindHost)) app.use(localhostHostValidation());
  app.use(express.json({ limit: '1mb' }));
  // Browsers may only call us from local pages (the simulator) or origins listed in ALLOWED_ORIGINS.
  // Requests without an Origin header (MCP clients, curl, same-origin page loads) are not affected.
  const originAllowed = (origin: string | undefined, host: string | undefined) => {
    if (!origin) return true;
    // Pages this server serves itself (the hosted simulator and parent page) are always allowed.
    try {
      if (host && new URL(origin).host === host) return true;
    } catch {
      return false;
    }
    return allowedOrigins?.length ? allowedOrigins.includes(origin) : LOCAL_ORIGIN.test(origin);
  };

  // Media and static files only read, and messages need their token: the sandboxed card (origin
  // "null") may load them, so its Web Audio can follow the goodnight message.
  const readOnlyMedia = (req: express.Request) => (req.method === 'GET' || req.method === 'HEAD') && /^\/(media\/messages|static)\//.test(req.path);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (!readOnlyMedia(req) && !originAllowed(origin, req.headers.host)) {
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
        await buildServer({ db, taskStore, escalateAfterMs, publicUrl, ai, voiceWaitMs: opts.voiceWaitMs, parentPage: demo ? `${publicUrl.replace(/\/$/, '')}/parent?k=${encodeURIComponent(parentKey)}` : null }).connect(t);
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
  const settingsView = () => {
    const busy = busyUntil(db);
    return {
      busy_until: busy ? formatTime(localTime(householdTz(db), busy).minutes) : null,
      shadow: Object.fromEntries(SHADOW_TOPICS.map((t) => [t, !shadowOffTopics(db).includes(t)])),
    };
  };

  const keyBuf = Buffer.from(parentKey);
  const authorised = (k: unknown) => {
    if (typeof k !== 'string') return false;
    const b = Buffer.from(k);
    return b.length === keyBuf.length && timingSafeEqual(b, keyBuf);
  };

  app.get('/parent', (_req, res) => void res.type('html').send(PARENT_HTML));
  // The service worker shows notifications when the page is closed. Scope: the parent page only.
  app.get('/parent/sw.js', (_req, res) => {
    res.setHeader('Service-Worker-Allowed', '/parent');
    res.setHeader('Cache-Control', 'no-cache');
    res.type('application/javascript').send(SERVICE_WORKER_JS);
  });
  // Lets an iPhone add the page to the home screen, which iOS needs for notifications.
  app.get('/parent/manifest.webmanifest', (req, res) => {
    if (!authorised(req.query.k)) return void res.sendStatus(401);
    res.type('application/manifest+json').json({
      name: "While You're Out",
      short_name: "While You're Out",
      start_url: `/parent?k=${encodeURIComponent(String(req.query.k))}`,
      scope: '/parent',
      display: 'standalone',
      background_color: '#f7f4ef',
      theme_color: '#1f2933',
      icons: [
        { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  });

  // Real phones with the parent page open (it polls every 2 s), so the demo can wait for them.
  // A phone stays counted for 90 s: a locked or backgrounded phone polls rarely, and its owner
  // may be waiting for the notification. (If they've really gone, the demo answers after 45 s.)
  const phonesSeen = new Map<string, number>();
  const phonesNow = () => {
    for (const [id, at] of phonesSeen) if (Date.now() - at > 90_000) phonesSeen.delete(id);
    return phonesSeen.size;
  };
  app.get('/parent/api/presence', (req, res) => {
    if (!authorised(req.query.k)) return void res.sendStatus(401);
    res.json({ phones: phonesNow() });
  });

  app.get('/parent/api/state', (req, res) => {
    if (!authorised(req.query.k)) return void res.sendStatus(401);
    const solo = typeof req.query.solo === 'string' && /^[a-z0-9]{4,16}$/.test(req.query.solo) ? req.query.solo : null;
    if (solo && (phonesSeen.has(solo) || phonesNow() < 20)) phonesSeen.set(solo, Date.now());
    res.json({
      handoff: activeHandoff(db) ?? null,
      timezone: householdTz(db),
      ...settingsView(),
      debrief: activeHandoff(db) ? null : latestDebrief(db),
      payment: (() => {
        // The latest evening's payment, for the debrief card: pay, or paid ✓.
        const p = db.prepare('SELECT carer, amount_cents, tip_cents, status, token FROM payments ORDER BY id DESC LIMIT 1').get() as { carer: string; amount_cents: number; tip_cents: number; status: string; token: string } | undefined;
        return p ? { carer: p.carer, total_cents: p.amount_cents + p.tip_cents, status: p.status, url: `/pay/${p.token}` } : null;
      })(),
      shopping: shopping(),
      teachback: (() => {
        const s = teachbackState(db);
        return s ? { done: s.done, answered: s.results.length, ...summary(s) } : null;
      })(),
      parents: contacts(db)
        .filter((c) => c.priority < 9)
        .map((c) => c.name),
      questions: pendingQuestions(db).map((q) => ({ ...q, contact: currentContactFor(db, q)?.name ?? null, door_snapshot: getDoorEvent(db, q.door_event_id)?.snapshot_url ?? null })),
      visitors: visitors(db),
      messages: messagesView(),
      log: eveningLog(db),
      emergency: lastEmergency,
      incident: (() => {
        // The emergency in progress, or one that ended in the last hour.
        const i = activeIncident(db) ?? latestIncident(db);
        if (!i || (i.status === 'resolved' && Date.now() - Date.parse(i.resolved_at ?? i.started_at) > 60 * 60_000)) return null;
        const sc = i.script as Record<string, unknown>;
        return { ...incidentView(db, i), description: i.description, say_first: sc.say_first, address: sc.address || null, carer: activeHandoff(db)?.carer_name ?? null };
      })(),
      household: getFamily(db).household,
      home: homeScreen(db),
      pass: passView(latestPass(db)),
      devices: devices(db),
      order: (() => {
        const o = latestOrder(db);
        return o && (o.status === 'pending' || Date.now() - Date.parse(o.created_at) < 6 * 3600_000) ? orderView(o) : null;
      })(),
      audit: auditLog(db, 40).map((a) => ({ ...a, time: clock(a.at) })),
      sitters: sitters(db),
      receipts: receipts(),
    });
  });

  // Everything paid for this week, on the parent's phone: dinner, supplies and the sitter.
  const receipts = () => {
    const since = new Date(now().getTime() - 7 * 86_400_000).toISOString();
    const orders = db.prepare("SELECT * FROM orders WHERE status = 'approved' AND created_at >= ? ORDER BY id DESC LIMIT 10").all(since) as unknown as Order[];
    const paid = db.prepare("SELECT * FROM payments WHERE status = 'paid' AND paid_at >= ? ORDER BY id DESC LIMIT 10").all(since) as unknown as Payment[];
    return [
      ...orders.map((o) => {
        const v = orderView(o);
        return { at: o.created_at, kind: v.kind, title: o.item, amount: v.price, reference: v.reference, from: o.restaurant, by: o.approved_by, detail: v.arrives ? `Arrives ${v.arrives}` : null };
      }),
      ...paid.map((p) => ({
        at: p.paid_at!,
        kind: 'sitter',
        title: `${p.carer} · ${duration(p.minutes)}`,
        amount: dollars(p.amount_cents + p.tip_cents),
        reference: `PAY-${String(p.id).padStart(4, '0')}`,
        from: 'Paid on your phone',
        by: null,
        detail: `${dollars(p.rate_cents)} an hour${p.tip_cents ? ` + ${dollars(p.tip_cents)} tip` : ''}`,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((r) => ({ ...r, time: clock(r.at) }));
  };

  // What the house remembers about a sitter: a parent changes it, or has it forgotten.
  app.post('/parent/api/sitter', (req, res) => {
    const { k, name, ...patch } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    try {
      res.json(updateSitter(db, name, patch));
    } catch (e) {
      if (e instanceof SitterError) return void res.status(400).json({ error: e.message });
      throw e;
    }
  });

  // ---------- Guest Pass ----------
  const clock = (iso: string) => formatTime(localTime(householdTz(db), new Date(iso)).minutes);
  const passView = (p: Pass | undefined) =>
    p
      ? {
          carer: p.carer,
          status: passOpen(p) ? 'active' : p.status === 'revoked' ? 'revoked' : 'ended',
          starts: clock(p.starts_at),
          ends: clock(p.ends_at),
          minutes_left: Math.round((Date.parse(p.ends_at) - now().getTime()) / 60000),
          opened_on_phone: Boolean(p.last_seen_at),
        }
      : null;
  // A parent extends tonight's pass or takes it back (from their phone).
  app.post('/parent/api/pass', (req, res) => {
    const { k, action, minutes, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    const who = typeof by === 'string' && by.trim() ? by.trim().slice(0, 40) : 'A parent';
    if (action === 'extend') {
      const m = Number(minutes);
      if (!Number.isInteger(m) || m < 15 || m > 240) return void res.status(400).json({ error: 'minutes must be 15 to 240' });
      const p = extendPass(db, m);
      if (!p) return void res.status(404).json({ error: 'No pass is active.' });
      audit(db, { actor: who, via: `${who}'s phone`, action: `Extended ${p.carer}'s pass to ${clock(p.ends_at)}` });
      return void res.json(passView(p));
    }
    if (action === 'end') {
      const p = endPass(db, 'revoked');
      if (!p) return void res.status(404).json({ error: 'No pass is active.' });
      audit(db, { actor: who, via: `${who}'s phone`, action: `Ended ${p.carer}'s pass`, pass_id: p.id });
      return void res.json(passView(p));
    }
    res.status(400).json({ error: 'action must be extend or end' });
  });

  // Dinner the sitter asked for: only a parent can approve it (from their phone).
  app.post('/parent/api/order', (req, res) => {
    const { k, id, action, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    const o = Number.isInteger(id) ? getOrder(db, id) : undefined;
    if (!o) return void res.status(404).json({ error: 'No such order.' });
    const who = typeof by === 'string' && by.trim() ? by.trim().slice(0, 40) : 'A parent';
    try {
      if (action === 'approve') {
        const done = approveOrder(db, o, who);
        audit(db, { actor: who, via: `${who}'s phone`, action: `Ordered ${done.item} (${orderView(done).price})`, detail: `Arrives ${orderView(done).arrives}; added to tonight's expected visitors.` });
        return void res.json(orderView(done));
      }
      if (action === 'decline') {
        const done = declineOrder(db, o, who);
        audit(db, { actor: who, via: `${who}'s phone`, action: `Said not tonight to ${done.item}` });
        return void res.json(orderView(done));
      }
      res.status(400).json({ error: 'action must be approve or decline' });
    } catch (e) {
      if (e instanceof OrderError) return void res.status(409).json({ error: e.message });
      throw e;
    }
  });

  // The front door, from a parent's phone: unlocked for the paramedics, or locked again.
  app.post('/parent/api/door', (req, res) => {
    const { k, action, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    const who = typeof by === 'string' && by.trim() ? by.trim().slice(0, 40) : 'A parent';
    if (action !== 'unlock' && action !== 'lock') return void res.status(400).json({ error: 'action must be unlock or lock' });
    const d = action === 'unlock' ? unlockDoor(db, who) : lockDoor(db, who);
    if (action === 'unlock') markDoorUnlocked(db, who);
    audit(db, { actor: who, via: `${who}'s phone`, action: action === 'unlock' ? 'Unlocked the front door' : 'Locked the front door' });
    res.json(d.door);
  });

  // The sitter's page, opened from the QR code on the Echo Show. Its calls carry the pass token.
  app.get('/guest', (_req, res) => void res.set('Cache-Control', 'no-store').type('html').send(GUEST_HTML));
  // Keeps the sitter's page on her phone, so it opens with no internet. Scope: that page only.
  app.get('/guest/sw.js', (req, res) => {
    res.setHeader('Service-Worker-Allowed', req.originalUrl.replace(/\/sw\.js(\?.*)?$/, ''));
    res.setHeader('Cache-Control', 'no-cache');
    res.type('application/javascript').send(GUEST_SW_JS);
  });
  const guestPass = (req: express.Request, res: express.Response): Pass | undefined => {
    const token = /^Bearer ([\w-]{20,100})$/.exec(String(req.headers.authorization ?? ''))?.[1];
    const p = token ? passByToken(db, token) : undefined;
    if (!p) return void res.status(401).json({ error: 'pass_unknown' });
    if (!passOpen(p)) return void res.status(403).json({ error: 'pass_ended', carer: p.carer });
    seen(db, p);
    return p;
  };
  app.get('/guest/api/state', (req, res) => {
    const p = guestPass(req, res);
    if (!p) return;
    const b = briefing(db);
    const h = activeHandoff(db);
    const plan = h ? tonightPlan(db, householdTz(db), h).items.filter((i) => i.status !== 'done').slice(0, 3) : [];
    res.set('Cache-Control', 'no-store').json({
      carer: p.carer,
      household: getFamily(db).household?.name || 'the family',
      ends: clock(p.ends_at),
      minutes_left: passView(p)!.minutes_left,
      must_know: b.must_know,
      epipen: b.epipen,
      address: b.address,
      contacts: contacts(db).map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
      next: plan.map((i) => ({ title: i.title, time: i.time })),
      questions: (db.prepare('SELECT id, text, status, answer, answered_by FROM questions WHERE handoff_id = ? ORDER BY id DESC LIMIT 10').all(p.handoff_id) as Array<Record<string, unknown>>),
      // Kept on the phone: if the internet drops, the plan and the safety steps are still there.
      guides: offlineGuides(db),
      // An emergency in progress: the same guide as the kitchen Echo Show, step for step.
      incident: (() => {
        const i = activeIncident(db);
        return i ? { ...incidentView(db, i), source: (i.script as { action_plan?: { source?: string } }).action_plan?.source ?? null } : null;
      })(),
    });
  });
  // "Done" on the sitter's phone moves the kitchen guide on too (and the parents see it).
  app.post('/guest/api/emergency', (req, res) => {
    const p = guestPass(req, res);
    if (!p) return;
    const action = req.body?.action as StepAction;
    if (!['done', 'next', 'back', 'resolved'].includes(action)) return void res.status(400).json({ error: 'action must be done, next, back or resolved' });
    const i = stepIncident(db, action, p.carer);
    if (!i) return void res.status(404).json({ error: 'No emergency is in progress.' });
    audit(db, { pass_id: p.id, actor: p.carer, via: `${p.carer}'s phone`, action: action === 'resolved' ? 'Said the emergency is over' : `Emergency guide: ${action}` });
    res.json(incidentView(db, i));
  });
  app.post('/guest/api/ask', (req, res) => {
    const p = guestPass(req, res);
    if (!p) return;
    const question = typeof req.body?.question === 'string' ? req.body.question.trim().slice(0, 300) : '';
    if (!question) return void res.status(400).json({ error: 'question required' });
    // An emergency is never a question for later: the page points at 911 and the kitchen guide.
    if (isEmergency(question)) {
      audit(db, { pass_id: p.id, actor: p.carer, via: `${p.carer}'s phone`, action: `Reported “${question}”`, detail: 'Shown: call 911, then the emergency guide in the kitchen.' });
      return void res.json({ emergency: true });
    }
    const q = createQuestion(db, question);
    audit(db, { pass_id: p.id, actor: p.carer, via: `${p.carer}'s phone`, action: `Asked the parents “${question}”` });
    res.json({ id: q.id, status: q.status });
  });

  const messagesView = () => listMessages(db).map(({ token, ...m }) => ({ ...m, url: `/media/messages/${m.id}?t=${token}` }));

  // ---------- Phone notifications ----------
  app.get('/parent/api/push/key', (req, res) => {
    if (!authorised(req.query.k)) return void res.sendStatus(401);
    res.json({ publicKey: push.publicKey });
  });
  app.post('/parent/api/push/subscribe', (req, res) => {
    const { k, subscription, member } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (!isValidSubscription(subscription)) return void res.status(400).json({ error: 'bad subscription' });
    push.subscribe(subscription, typeof member === 'string' && member.trim() ? member.trim().slice(0, 40) : null);
    res.json({ ok: true });
  });
  app.post('/parent/api/push/unsubscribe', (req, res) => {
    const { k, endpoint } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (typeof endpoint !== 'string') return void res.status(400).json({ error: 'endpoint required' });
    push.unsubscribe(endpoint);
    res.json({ ok: true });
  });
  app.post('/parent/api/push/test', async (req, res) => {
    const { k, endpoint } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (!pushTestAllowed(ipOf(req))) return void res.status(429).json({ error: 'Too many test notifications; try again in a minute.' });
    const sent = await push.notify(
      'everyone',
      { title: "While You're Out", body: "Notifications are on. Questions and emergencies will reach you here.", tag: 'test' },
      { endpoint: typeof endpoint === 'string' ? endpoint : undefined },
    );
    res.json({ sent });
  });

  // ---------- Emergency: a parent tells the sitter they're coming ----------
  app.post('/parent/api/incident', (req, res) => {
    const { k, action, minutes, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (action !== 'on_the_way' || typeof minutes !== 'number' || !Number.isFinite(minutes)) return void res.status(400).json({ error: 'action on_the_way and minutes required' });
    const i = markOnTheWay(db, parentName(by), minutes);
    if (!i) return void res.status(409).json({ error: 'There is no emergency in progress.' });
    res.json({ incident: incidentView(db, i) });
  });

  // ---------- Who to expect tonight (the Front Door Guard reads this) ----------
  app.post('/parent/api/visitors', (req, res) => {
    const { k, action, id, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    try {
      if (action === 'add') addVisitor(db, req.body, parentName(by));
      else if (action === 'remove' && Number.isInteger(id)) removeVisitor(db, id);
      else return void res.status(400).json({ error: 'action must be add or remove' });
      res.json({ visitors: visitors(db) });
    } catch (e) {
      if (e instanceof VisitorError) return void res.status(400).json({ error: e.message });
      throw e;
    }
  });

  // ---------- Paying the sitter: the page the Echo Show's URL elicitation sends the parent to ----------
  // The unguessable token in the address is the permission (a capability URL), like a payment link.
  app.get('/pay/:token', (req, res) => {
    const p = paymentByToken(db, req.params.token);
    if (!p) return void res.status(404).type('text').send('This payment link has expired.');
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(payPage(p));
  });
  // From the morning debrief: "Pay Priya" without asking Alexa.
  app.post('/parent/api/pay', (req, res) => {
    if (!authorised(req.body?.k)) return void res.sendStatus(401);
    const h = payableHandoff(db);
    if (!h) return void res.status(409).json({ error: "There's no evening to pay for yet." });
    try {
      const p = createPayment(db, h);
      res.json({ url: `/pay/${p.token}` });
    } catch (e) {
      if (e instanceof PaymentError) return void res.status(409).json({ error: e.message });
      throw e;
    }
  });
  app.post('/pay/:token', (req, res) => {
    const p = paymentByToken(db, req.params.token);
    if (!p) return void res.sendStatus(404);
    const { action, tip } = req.body ?? {};
    try {
      if (action === 'pay') return void res.json(approvePayment(db, p, typeof tip === 'number' ? tip : 0));
      if (action === 'decline') {
        declinePayment(db, p);
        return void res.json({ ok: true });
      }
      res.status(400).json({ error: 'action must be pay or decline' });
    } catch (e) {
      if (e instanceof PaymentError) return void res.status(409).json({ error: e.message });
      throw e;
    }
  });

  // ---------- Goodnight messages ----------
  // Recorded on the phone (the raw audio/video is the body), played on the Echo Show.
  // The public demo keeps recordings small and few: every house's messages share one server's memory.
  const messageLimits = demo ? { maxBytes: DEMO_MESSAGE_BYTES, keep: 2 } : { maxBytes: MAX_MESSAGE_BYTES, keep: 6 };
  app.post('/parent/api/messages', heavyBody, express.raw({ type: ['audio/*', 'video/*'], limit: messageLimits.maxBytes }), (req, res) => {
    if (!authorised(req.query.k)) return void res.sendStatus(401);
    if (!Buffer.isBuffer(req.body)) return void res.status(400).json({ error: 'Send the recording as audio or video.' });
    try {
      const q = req.query;
      const m = saveMessage(db, messageLimits, {
        data: req.body,
        mime: String(req.headers['content-type'] ?? ''),
        from: parentName(q.by),
        for_name: typeof q.for === 'string' ? q.for : null,
        when: typeof q.when === 'string' ? q.when : undefined,
        caption: typeof q.caption === 'string' ? q.caption : null,
      });
      res.json({ message: { ...m, token: undefined }, messages: messagesView() });
    } catch (e) {
      if (e instanceof MessageError) return void res.status(400).json({ error: e.message });
      throw e;
    }
  });
  app.post('/parent/api/messages/remove', (req, res) => {
    const { k, id } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (!Number.isInteger(id)) return void res.status(400).json({ error: 'id required' });
    removeMessage(db, id);
    res.json({ messages: messagesView() });
  });
  app.get('/media/messages/:id', (req, res) => {
    const m = messageMedia(db, Number(req.params.id), req.query.t);
    if (!m) return void res.sendStatus(404);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Accept-Ranges', 'none');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.type(m.mime).send(m.data);
  });

  // ---------- Family setup ----------
  app.get('/parent/api/family', (req, res) => {
    if (!authorised(req.query.k)) return void res.sendStatus(401);
    res.json({ ...getFamily(db), consent: consent(db) });
  });
  app.post('/parent/api/family', (req, res) => {
    const { k, family, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    try {
      const saved = saveFamily(db, family, parentName(by));
      recordConsent(db, parentName(by));
      res.json({ ...saved, consent: consent(db) });
    } catch (e) {
      if (e instanceof FamilyError) return void res.status(400).json({ error: e.message });
      throw e;
    }
  });
  // "Reset to the demo family" (so every visitor starts clean) or "start fresh" with an empty house.
  app.post('/parent/api/reset', (req, res) => {
    const { k, mode, timezone } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    try {
      if (mode === 'demo') return void res.json(resetToDemo(db));
      if (mode === 'fresh') return void res.json(startFresh(db, typeof timezone === 'string' ? timezone : ''));
      res.status(400).json({ error: 'mode must be demo or fresh' });
    } catch (e) {
      if (e instanceof FamilyError) return void res.status(400).json({ error: e.message });
      throw e;
    }
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

  // ---------- Busy mode and Shadow Parent settings ----------
  app.post('/parent/api/busy', (req, res) => {
    const { k, minutes } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return void res.status(400).json({ error: 'minutes must be 0 or more' });
    setBusy(db, minutes);
    res.json(settingsView());
  });

  app.post('/parent/api/shadow', (req, res) => {
    const { k, topic, on } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (!SHADOW_TOPICS.includes(topic) || typeof on !== 'boolean') return void res.status(400).json({ error: 'topic and on required' });
    setShadowTopic(db, topic, on);
    res.json(settingsView());
  });

  // ---------- Morning debrief ----------
  app.post('/parent/api/save-rule', (req, res) => {
    const { k, question_id } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (!Number.isInteger(question_id)) return void res.status(400).json({ error: 'question_id required' });
    if (!saveAnswerAsRule(db, question_id)) return void res.status(409).json({ error: "That answer can't be saved as a rule." });
    res.json({ ok: true, debrief: latestDebrief(db) });
  });

  // A simulated shopping list (in production this would be the family's Alexa shopping list).
  const shopping = () => shoppingList(db);
  app.post('/parent/api/shopping', (req, res) => {
    const { k, item } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (typeof item !== 'string' || !item.trim() || item.length > 60) return void res.status(400).json({ error: 'item required' });
    res.json({ shopping: addToShoppingList(db, item) });
  });

  // ---------- House Brain: teach the house from notes parents already have ----------
  const parentName = (by: unknown) => (typeof by === 'string' && by.trim() ? by.trim().slice(0, 40) : 'Parent');

  const proposalsView = () => {
    const ps = pendingProposals(db);
    const imports = [...new Set(ps.map((p) => p.import_id))].map((id) => importInfo(db, id));
    const factText = new Map(visibleFacts(db, 'parent').map((f) => [f.id, f.text]));
    return {
      ai_available: ai.available,
      imports,
      proposals: ps.map((p) => ({ ...p, conflict_text: p.conflict_fact_id ? factText.get(p.conflict_fact_id) ?? null : null })),
    };
  };

  const runImport = async (res: express.Response, input: Parameters<typeof importNote>[2]) => {
    try {
      const out = await importNote(db, ai, input);
      res.json({ ...out, ...proposalsView() });
    } catch (e) {
      if (e instanceof ImportError) return void res.status(400).json({ error: e.message });
      if (e instanceof AiUnavailableError) return void res.status(503).json({ error: e.message });
      console.error('Import failed', e);
      res.status(500).json({ error: 'Could not read that note. Try again, or paste the text instead.' });
    }
  };

  // Typed or pasted text (a WhatsApp message, a note).
  app.post('/parent/api/import/text', async (req, res) => {
    const { k, text, label, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    if (typeof text !== 'string') return void res.status(400).json({ error: 'text required' });
    if (!aiAllowed(ipOf(req), 'import')) return void res.status(429).json({ error: 'That is a lot of notes at once. Try again in a minute.' });
    await runImport(res, { kind: 'text', text, label: typeof label === 'string' && label.trim() ? label.trim() : 'Typed note', author: parentName(by) });
  });

  // A photo or PDF, sent as the raw file body (too big for the JSON limit).
  app.post(
    '/parent/api/import/file',
    heavyBody,
    express.raw({ type: [...IMAGE_TYPES, 'application/pdf'], limit: MAX_IMPORT_BYTES }),
    async (req, res) => {
      if (!authorised(req.query.k)) return void res.sendStatus(401);
      if (!aiAllowed(ipOf(req), 'import')) return void res.status(429).json({ error: 'That is a lot of notes at once. Try again in a minute.' });
      const mime = String(req.headers['content-type'] ?? '').split(';')[0].trim();
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) return void res.status(400).json({ error: 'Send a PNG, JPEG, WebP, HEIC or PDF file.' });
      const kind = mime === 'application/pdf' ? 'pdf' : 'photo';
      const label = typeof req.query.label === 'string' && req.query.label.trim() ? req.query.label.trim() : kind === 'pdf' ? 'PDF document' : 'Photo of a note';
      await runImport(res, { kind, mimeType: mime, data: req.body.toString('base64'), label, author: parentName(req.query.by) });
    },
  );

  app.get('/parent/api/proposals', (req, res) => {
    if (!authorised(req.query.k)) return void res.sendStatus(401);
    res.json(proposalsView());
  });

  app.post('/parent/api/proposals/:id', (req, res) => {
    const { k, action, resolution, text, by } = req.body ?? {};
    if (!authorised(k)) return void res.sendStatus(401);
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || (action !== 'accept' && action !== 'discard')) return void res.status(400).json({ error: 'action must be accept or discard' });
    if (resolution !== undefined && !['replace', 'keep_both', 'keep_old'].includes(resolution)) return void res.status(400).json({ error: 'bad resolution' });
    if (text !== undefined && typeof text !== 'string') return void res.status(400).json({ error: 'bad text' });
    try {
      const out = decideProposal(db, id, { action, resolution, text, by: parentName(by) });
      res.json({ ...out, ...proposalsView() });
    } catch (e) {
      if (e instanceof ProposalError) return void res.status(e.status).json({ error: e.message });
      throw e;
    }
  });

  // ---------- The simulator's "Alexa" brain: a Gemini proxy so the key never reaches a browser ----------
  // In production Alexa+ is the brain; this exists only for the Echo Show simulator.
  if (opts.hostLlm ?? process.env.WYO_HOST_LLM !== '0') {
    // It is not a general Gemini proxy: the server writes the system prompt itself, the turns may
    // only be text and tool calls (no files or images), the tools must look like ours, and the
    // whole server and each visitor have a budget (shared by every demo house).
    const system = `${HOST_SYSTEM}\n\nAdd-on instructions: ${ADDON_INSTRUCTIONS}`;
    // Gemini's own replies come back in the next turn with whatever fields it added (thought
    // signatures...), so only what a caller could misuse is refused: files and images.
    const FILE_PARTS = ['inlineData', 'fileData'];
    const validTurn = (t: any) =>
      t && (t.role === 'user' || t.role === 'model') && Array.isArray(t.parts) && t.parts.length <= 12 && t.parts.every((p: any) => p && typeof p === 'object' && !FILE_PARTS.some((k) => k in p));
    const validFunction = (f: any) => f && typeof f.name === 'string' && /^[a-z][a-z_]{1,39}$/.test(f.name) && (f.description === undefined || (typeof f.description === 'string' && f.description.length <= 1500));
    app.post('/host/llm', async (req, res) => {
      const { contents, functions } = req.body ?? {};
      if (!Array.isArray(contents) || !Array.isArray(functions) || contents.length > 60 || functions.length > 40) {
        return void res.status(400).json({ error: 'contents and functions required' });
      }
      if (!contents.every(validTurn) || !functions.every(validFunction) || JSON.stringify(req.body).length > 64_000) {
        return void res.status(400).json({ error: "Only the simulator's own conversation can be sent." });
      }
      if (!aiAllowed(ipOf(req), 'chat')) return void res.status(429).json({ error: 'Too many requests; try again in a minute.' });
      try {
        res.json(await (opts.chat ?? geminiChat)({ system, contents, functions }));
      } catch (e) {
        // The device falls back to its rules; Google's own error text stays in the server log.
        console.warn('host/llm:', e instanceof Error ? e.message : e);
        res.status(503).json({ error: e instanceof Error && /GEMINI_API_KEY/.test(e.message) ? 'No model key on this server.' : 'The model is unavailable right now.' });
      }
    });
  }

  // ---------- Demo clock (only with WYO_DEMO=1): lets a video jump to 7:40 pm ----------
  if (demo) {
    // The demo deployment is public, so the simulator may link straight to the parent page.
    app.get('/demo/config', (_req, res) => void res.json({ parent_url: `/parent?k=${encodeURIComponent(parentKey)}` }));
    // Stands in for a Ring doorbell event (Ring's API in production): who pressed the bell.
    const RINGERS: Record<string, { kind: 'person' | 'package'; label: string; snapshot_url: string }> = {
      delivery: { kind: 'package', label: 'Delivery driver with a package', snapshot_url: '/static/door/delivery.jpg' },
      stranger: { kind: 'person', label: 'Person at the front door', snapshot_url: '/static/door/stranger.jpg' },
      grandma: { kind: 'person', label: 'Person at the front door', snapshot_url: '/static/door/grandma.jpg' },
    };
    app.post('/demo/ring', (req, res) => {
      const who = String(req.body?.who);
      const r = Object.hasOwn(RINGERS, who) ? RINGERS[who] : undefined;
      if (!r) return void res.status(400).json({ error: 'who must be delivery, stranger or grandma' });
      const ev = recordDoorEvent(db, { ...r, source: 'ring (simulated)' });
      res.json({ ...ev, time: formatTime(localTime(householdTz(db), new Date(ev.at)).minutes) });
    });
    app.get('/demo/clock', (_req, res) => void res.json({ ...localTime(householdTz(db)), demo: true }));
    // The rest of the house, for the simulator's room panels (Fire TV, the child's Echo Dot, the door, Bee).
    app.get('/demo/devices', (_req, res) => void res.set('Cache-Control', 'no-store').json(devices(db)));
    // Stands in for Bee (the parent's wearable): what a parent said to it, for tonight. The plan reads
    // it ("she napped until 4:30" moves bedtime by the parents' own rule); the sitter hears it next.
    app.post('/demo/bee', (req, res) => {
      const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 300) : '';
      if (!text) return void res.status(400).json({ error: 'text required' });
      const by = typeof req.body?.by === 'string' && req.body.by.trim() ? req.body.by.trim().slice(0, 40) : (contacts(db)[0]?.name ?? 'A parent');
      beeNote(db, by, text);
      const change = activeHandoff(db) ? applyLogToPlan(db, householdTz(db), text) : null;
      if (activeHandoff(db)) pushNotice(db, change?.new_bedtime ? `${by} told her Bee: "${text}". Bedtime is now ${change.new_bedtime}.` : `${by} says: "${text}"`);
      audit(db, { actor: by, via: `${by}'s Bee`, action: `Said “${text}”`, detail: change?.message ?? null });
      res.json({ ok: true, plan_change: change?.message ?? null, devices: devices(db) });
    });
    // The guided demo starts every run from the demo family, even after a reload mid-demo.
    app.post('/demo/reset', (_req, res) => {
      resetClock();
      res.json(resetToDemo(db));
    });
    app.post('/demo/clock', (req, res) => {
      try {
        if (req.body?.reset) {
          resetClock();
          return void res.json(localTime(householdTz(db)));
        }
        const day = typeof req.body?.day === 'string' && req.body.day ? req.body.day : undefined;
        res.json(setDemoTime(String(req.body?.time ?? ''), householdTz(db), day));
      } catch (e) {
        res.status(400).json({ error: e instanceof Error ? e.message : 'bad time' });
      }
    });
  }

  app.use('/static', express.static(fileURLToPath(new URL('../public', import.meta.url))));
  // The built Echo Show simulator, when present (the hosted demo): one URL for everything.
  const simulatorDist = process.env.WYO_SIMULATOR_DIR ?? fileURLToPath(new URL('../../simulator/dist', import.meta.url));
  if (existsSync(simulatorDist)) app.use('/', express.static(simulatorDist));
  // The privacy notice and terms an Alexa+ listing links to.
  // Any MCP host, not just Alexa+: this house's address and how to add it. Outside a house, a new one.
  app.get('/connect', (_req, res) => {
    if (!/\/h\/[A-Za-z0-9_-]{16,64}$/.test(publicUrl.replace(/\/$/, ''))) return void res.redirect(`h/${randomBytes(16).toString('hex')}/connect`);
    const here = publicUrl.replace(/\/$/, '');
    res.type('html').send(connectPage(`${here}/mcp`, `${here}/parent?k=${encodeURIComponent(parentKey)}`));
  });
  app.get('/privacy', (_req, res) => void res.type('html').send(PRIVACY));
  app.get('/terms', (_req, res) => void res.type('html').send(TERMS));
  app.get('/health', (_req, res) => void res.json({ ok: true }));
  // Which commit is live: Render sets RENDER_GIT_COMMIT on every deploy.
  app.get('/version', (_req, res) =>
    void res.json({ commit: process.env.RENDER_GIT_COMMIT ?? process.env.WYO_COMMIT ?? 'dev', started_at: STARTED_AT }),
  );

  // JSON errors instead of Express's HTML error page (e.g. a file over the size limit).
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(err);
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 500) console.error('Unhandled error', err);
    res.status(status).json({ error: status === 413 ? (req.path.startsWith('/parent/api/import') ? 'That file is larger than 6 MB.' : 'That is too large to send.') : status >= 500 ? 'Internal error' : String(err?.message ?? 'Bad request') });
  });

  const passTimer = setInterval(() => {
    passTick(db);
    // Once an hour: what's older than the retention period goes.
    if (new Date().getMinutes() === 0) pruneOld(db);
    const h = activeHandoff(db);
    if (h) houseTick(db, tonightPlan(db, householdTz(db), h).items.filter((i) => i.status === 'due').map((i) => i.key), contacts(db)[0]?.name ?? 'the parents');
  }, 60_000);
  passTimer.unref();

  const close = () => {
    clearInterval(passTimer);
    clearInterval(sweeper);
    push.close();
    events.off('emergency', onEmergency);
    events.off('handoff', clearEmergency);
    events.off('reset', clearEmergency);
    events.off('incident', onIncident);
    taskStore.cleanup();
    for (const t of sessions.values()) void t.close();
  };
  return { app, db, taskStore, parentKey, push, close };
}

/**
 * How the public demo makes each visitor's house: in memory, with a parent key of its own, so
 * knowing one house's parent link never opens another's. The shared house keeps WYO_DB and the
 * configured key.
 */
export const demoHouse =
  (base: AppOptions = {}) =>
  (url: string, isShared: boolean) =>
    createApp({ ...base, publicUrl: url, ...(isShared ? {} : { dbPath: ':memory:', parentKey: randomBytes(18).toString('base64url') }) });

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
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(',').map((h) => h.trim());
  const publicUrl = process.env.WYO_PUBLIC_URL ?? `http://127.0.0.1:${port}`;
  // Every visitor of the demo gets a house of their own; the shared one keeps WYO_DB if set. Each
  // house has its own parent key, so knowing one house's parent link never opens another's.
  const { app, shared } = createHouses(demoHouse({ host, allowedHosts }), { publicUrl });
  const parentKey = shared.parentKey;
  app.listen(port, host, () => {
    console.log(`While You're Out MCP server: http://${host}:${port}/mcp`);
    console.log(`Parent page: http://${host}:${port}/parent?k=${parentKey}`);
  });
}
