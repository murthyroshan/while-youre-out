// The public demo: every visitor gets their own copy of the demo family, so two judges trying it
// at once never see each other's evening. A house is picked by a path prefix (/h/<id>/mcp, used by
// the simulator and by links the server makes) or, for the parent page and its service worker,
// by a cookie set when that page is opened through its prefixed link. A plain MCP client pointed at
// /mcp (a judge's Inspector, a Claude connector) gets a house of its own for its session. Anything
// else (old links) reaches the shared house.
import { EventEmitter } from 'node:events';
import { randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import express from 'express';
import { houseStore, type HouseContext } from './context.js';
import { newHouseAllowed } from './limits.js';
import { ALEXA_REDIRECTS, createOAuth, type OAuthClient } from './oauth.js';

/** House ids are made by the simulator (random, unguessable); nothing else identifies a house. */
export const HOUSE_ID = /^[A-Za-z0-9_-]{16,64}$/;
const PREFIX = /^\/h\/([A-Za-z0-9_-]{16,64})(?=[/?]|$)/;
const COOKIE = 'wyo_house';

export interface HouseApp {
  app: express.Express;
  close: () => void;
}

export interface HousesOptions {
  /** Base URL of the whole server; a house's own links get /h/<id> added. */
  publicUrl: string;
  /** Most houses kept at once; the least recently used one goes first. Default 40. */
  maxHouses?: number;
  /** A house nobody has used for this long is removed. Default 3 hours. */
  idleMs?: number;
  /** New houses allowed per minute across the server. Default 30. */
  newPerMinute?: number;
  /** Apps allowed to link a household (OAuth). Default: Alexa, from WYO_OAUTH_CLIENT_ID / _SECRET. */
  oauthClients?: OAuthClient[];
}

type House<T extends HouseApp> = T & {
  ctx: HouseContext;
  lastUsed: number;
};

/**
 * `make` builds one house (createApp with its options). The shared house is built outside any
 * house context, exactly like a single-house server.
 */
export function createHouses<T extends HouseApp>(make: (publicUrl: string, shared: boolean) => T, opts: HousesOptions) {
  const maxHouses = opts.maxHouses ?? 40;
  const idleMs = opts.idleMs ?? 3 * 60 * 60_000;
  const newPerMinute = opts.newPerMinute ?? 30;
  const secure = opts.publicUrl.startsWith('https:');
  const shared = make(opts.publicUrl, true);
  const houses = new Map<string, House<T>>();
  const recentlyMade: number[] = [];
  /** MCP session id -> house id, for clients that connect to plain /mcp. */
  const sessionHouses = new Map<string, string>();

  const remove = (id: string) => {
    const h = houses.get(id);
    if (!h) return;
    houses.delete(id);
    for (const [sid, hid] of sessionHouses) if (hid === id) sessionHouses.delete(sid);
    // Its listeners and timers were registered inside the house, so they are removed there too.
    houseStore.run(h.ctx, () => h.close());
  };

  /** The house, or null if a new one can't be made now, or undefined if this request can't make one. */
  const get = (id: string, visitor: string | null): House<T> | null | undefined => {
    const found = houses.get(id);
    if (found) {
      found.lastUsed = Date.now();
      return found;
    }
    if (visitor === null) return undefined;
    if (!newHouseAllowed(visitor)) return null;
    const t = Date.now();
    while (recentlyMade.length && recentlyMade[0] < t - 60_000) recentlyMade.shift();
    if (recentlyMade.length >= newPerMinute) return null;
    recentlyMade.push(t);
    if (houses.size >= maxHouses) {
      const oldest = [...houses.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
      if (oldest) remove(oldest[0]);
    }
    const bus = new EventEmitter();
    bus.setMaxListeners(200);
    const ctx: HouseContext = { id, events: bus, clockOffsetMs: 0 };
    const made = houseStore.run(ctx, () => make(`${opts.publicUrl}/h/${id}`, false));
    const house: House<T> = { ...made, ctx, lastUsed: t };
    houses.set(id, house);
    return house;
  };

  const sweeper = setInterval(() => {
    const cutoff = Date.now() - idleMs;
    for (const [id, h] of houses) if (h.lastUsed < cutoff) remove(id);
  }, 10 * 60_000);
  sweeper.unref();

  const app = express();
  app.disable('x-powered-by');
  if (process.env.RENDER || process.env.WYO_TRUST_PROXY === '1') app.set('trust proxy', 1);

  // Account linking: a household that links gets its own house, and its token says which.
  const oauth = createOAuth({
    publicUrl: opts.publicUrl,
    resourcePath: '/linked/mcp',
    newHouse: () => randomBytes(18).toString('base64url'),
    clients: opts.oauthClients ?? [
      {
        id: process.env.WYO_OAUTH_CLIENT_ID ?? 'alexa-addon',
        secret: process.env.WYO_OAUTH_CLIENT_SECRET || undefined,
        name: 'Alexa',
        redirects: [...ALEXA_REDIRECTS, ...(process.env.WYO_OAUTH_REDIRECTS?.split(',').map((u) => u.trim()).filter(Boolean) ?? [])],
      },
    ],
  });
  app.use(oauth.router);
  // Only what starts a visit makes a house (the simulator connecting, the parent page, the demo
  // controls); anything else for a house that doesn't exist is simply not found.
  const startsVisit = (url: string) => /^\/(mcp|parent|demo|host|connect)(\/|\?|$)/.test(url);
  app.use((req, res, next) => {
    // /linked/mcp is the add-on as Alexa calls it after account linking: a token, or a bare 401
    // that starts linking. A token on plain /mcp is honoured too; a bad one is refused.
    const linked = /^\/linked\/mcp(\/|\?|$)/.test(req.url);
    if (linked || (/^\/mcp(\/|\?|$)/.test(req.url) && req.headers.authorization?.startsWith('Bearer '))) {
      const grant = oauth.verify(req.headers.authorization);
      if (!grant) return oauth.challenge(res);
      if (linked) req.url = req.url.slice('/linked'.length);
      const house = get(grant.house, req.ip ?? 'unknown');
      if (!house) return void res.status(429).json({ error: 'The demo is very busy right now. Try again in a minute.' });
      return houseStore.run(house.ctx, () => house.app(req, res, next));
    }
    const m = PREFIX.exec(req.url);
    let id = m?.[1];
    if (m) {
      const rest = req.url.slice(m[0].length);
      req.url = rest.startsWith('/') ? rest : `/${rest}`;
      // The parent page calls /parent/api/... directly: remember its house in this browser.
      if (req.method === 'GET' && /^\/parent(\?|$)/.test(req.url)) {
        res.append('Set-Cookie', `${COOKIE}=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure ? '; Secure' : ''}`);
      }
    } else {
      const fromCookie = cookie(req.headers.cookie, COOKIE);
      if (fromCookie && HOUSE_ID.test(fromCookie)) id = fromCookie;
    }
    // Plain /mcp: each MCP session gets its own fresh demo family, so two people testing at once
    // never share an evening or reset each other's. The session id the house hands out picks it later.
    if (!id && /^\/mcp(\/|\?|$)/.test(req.url)) {
      const sid = req.headers['mcp-session-id'];
      if (typeof sid === 'string') {
        id = sessionHouses.get(sid);
        // An unknown or expired session: the client starts a new one (MCP's "session not found").
        if (!id) return void res.status(404).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
      } else {
        const own = randomBytes(18).toString('base64url');
        id = own;
        onSessionId(res, (s) => {
          sessionHouses.set(s, own);
          // Bounded: the oldest sessions are forgotten first (their houses age out on their own).
          if (sessionHouses.size > 4 * maxHouses) sessionHouses.delete(sessionHouses.keys().next().value!);
        });
      }
    }
    if (!id) return shared.app(req, res, next);
    const house = get(id, startsVisit(req.url) ? (req.ip ?? 'unknown') : null);
    if (house === undefined) return void res.status(404).json({ error: 'No such demo house.' });
    if (!house) return void res.status(429).json({ error: 'The demo is very busy right now. Try again in a minute.' });
    houseStore.run(house.ctx, () => house.app(req, res, next));
  });

  const close = () => {
    clearInterval(sweeper);
    for (const id of [...houses.keys()]) remove(id);
    shared.close();
  };
  return { app, close, houses, shared };
}

/** Calls `found` with the MCP session id a response hands out, however its headers are written. */
function onSessionId(res: ServerResponse, found: (sid: string) => void) {
  let seen = false;
  const check = (name: unknown, value: unknown) => {
    if (seen || String(name).toLowerCase() !== 'mcp-session-id' || value == null) return;
    seen = true;
    found(String(value));
  };
  const setHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) => {
    check(name, value);
    return setHeader(name, value);
  }) as typeof res.setHeader;
  const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => ServerResponse;
  res.writeHead = ((...args: unknown[]) => {
    for (const a of args.slice(1)) {
      if (Array.isArray(a)) {
        // [k, v, k, v] or [[k, v], ...]
        if (a.every((x) => Array.isArray(x))) for (const [k, v] of a as unknown[][]) check(k, v);
        else for (let i = 0; i + 1 < a.length; i += 2) check(a[i], a[i + 1]);
      } else if (a && typeof a === 'object') for (const [k, v] of Object.entries(a)) check(k, v);
    }
    return writeHead(...args);
  }) as typeof res.writeHead;
}

function cookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}
