// The public demo: every visitor gets their own copy of the demo family, so two judges trying it
// at once never see each other's evening. A house is picked by a path prefix (/h/<id>/mcp, used by
// the simulator and by links the server makes) or, for the parent page and its service worker,
// by a cookie set when that page is opened through its prefixed link. Anything else (an MCP
// client pointed at /mcp, old links) reaches the shared house.
import { EventEmitter } from 'node:events';
import express from 'express';
import { houseStore, type HouseContext } from './context.js';

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

  const remove = (id: string) => {
    const h = houses.get(id);
    if (!h) return;
    houses.delete(id);
    // Its listeners and timers were registered inside the house, so they are removed there too.
    houseStore.run(h.ctx, () => h.close());
  };

  const get = (id: string): House<T> | null => {
    const found = houses.get(id);
    if (found) {
      found.lastUsed = Date.now();
      return found;
    }
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
  app.use((req, res, next) => {
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
    if (!id) return shared.app(req, res, next);
    const house = get(id);
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

function cookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(';') ?? []) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return undefined;
}
