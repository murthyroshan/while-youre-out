// The public demo: every visitor's house is separate (database, events, demo clock), the parent
// page finds its house by cookie, and the number of houses stays bounded.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import { createHouses } from '../src/houses.js';

const KEY = 'houses-key';
const A = 'aaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccc';

const servers: Array<{ http: Server; close: () => void; clients: Client[] }> = [];
after(async () => {
  for (const s of servers) {
    for (const c of s.clients) await c.close();
    s.close();
    s.http.closeAllConnections();
    s.http.close();
  }
});

async function start(opts: { maxHouses?: number; newPerMinute?: number } = {}) {
  const houses = createHouses((url) => createApp({ parentKey: KEY, publicUrl: url, demo: true, escalateAfterMs: 60_000 }), { publicUrl: 'http://demo.test', ...opts });
  const http = houses.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  const s = { http, close: houses.close, clients: [] as Client[] };
  servers.push(s);
  const connect = async (id: string) => {
    const c = new Client({ name: `house-${id.slice(0, 4)}`, version: '0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/h/${id}/mcp`)));
    s.clients.push(c);
    return async (name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as any;
  };
  const state = async (id: string) => (await fetch(`${base}/h/${id}/parent/api/state?k=${KEY}`)).json();
  return { base, houses, connect, state };
}

test('two visitors each get their own house: a handoff and an emergency in one never reach the other', async () => {
  const { connect, state } = await start();
  const a = await connect(A);
  const b = await connect(B);
  await a('start_handoff', { carer_name: 'Priya' });
  await a('emergency', { description: "She can't breathe" });
  assert.equal((await state(A)).handoff.carer_name, 'Priya');
  assert.ok((await state(A)).emergency, 'house A has the emergency');
  assert.equal((await state(B)).handoff, null, 'house B has no handoff');
  assert.equal((await state(B)).emergency, null, 'house B never heard of the emergency');
  const home = await b('home_screen');
  assert.equal(home.structuredContent.mode, 'parent');
});

test('each house has its own demo clock', async () => {
  const { base } = await start();
  const post = (id: string, body: unknown) => fetch(`${base}/h/${id}/demo/clock`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await post(A, { time: '20:30' });
  await post(B, { time: '07:15' });
  const clock = async (id: string) => (await (await fetch(`${base}/h/${id}/demo/clock`)).json()).hhmm;
  assert.equal(await clock(A), '20:30');
  assert.equal(await clock(B), '07:15');
});

test('the parent page, opened through its house link, finds the same house by cookie', async () => {
  const { base, connect } = await start();
  const a = await connect(A);
  await a('start_handoff', { carer_name: 'Priya' });
  const page = await fetch(`${base}/h/${A}/parent?k=${KEY}`);
  assert.equal(page.status, 200);
  const set = page.headers.get('set-cookie') ?? '';
  assert.match(set, new RegExp(`wyo_house=${A}`));
  assert.match(set, /HttpOnly/);
  const cookie = set.split(';')[0];
  // The page's own calls have no prefix: the cookie picks the house.
  const s = await (await fetch(`${base}/parent/api/state?k=${KEY}`, { headers: { cookie } })).json();
  assert.equal(s.handoff.carer_name, 'Priya');
  // Without the cookie it is the shared house.
  assert.equal((await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json()).handoff, null);
});

test('a remembered house that has gone (a restart, or aged out) is forgotten, not an error', async () => {
  const { base } = await start();
  // This browser opened a parent page before the demo restarted: its house no longer exists.
  const cookie = `wyo_house=${'d'.repeat(24)}`;
  // (/health stands for any page: CI doesn't build the simulator the root would serve.)
  const page = await fetch(`${base}/health`, { headers: { cookie } });
  assert.equal(page.status, 200, 'the page loads, not "No such demo house"');
  assert.match(page.headers.get('set-cookie') ?? '', /wyo_house=;.*Max-Age=0/, 'the stale cookie is cleared');
  // The same browser's next visit starts afresh.
  const again = await fetch(`${base}/parent/api/state?k=${KEY}`, { headers: { cookie } });
  assert.notEqual(again.status, 404);
});

test('links the server makes for a house point back into that house', async () => {
  const { connect } = await start();
  const a = await connect(A);
  await a('start_handoff', { carer_name: 'Priya' });
  // The goodnight message plays from a media link inside the house.
  const msg = await a('play_message', { when: 'any' });
  assert.match(JSON.stringify(msg.structuredContent), new RegExp(`http://demo\\.test/h/${A}/media/messages/`));
});

test('houses are bounded: the least recently used goes first, and new ones are rate limited', async () => {
  const small = await start({ maxHouses: 2 });
  await small.state(A);
  await small.state(B);
  await small.state(C);
  assert.deepEqual([...small.houses.houses.keys()].sort(), [B, C]);

  const slow = await start({ newPerMinute: 1 });
  assert.equal((await fetch(`${slow.base}/h/${C}/health`)).status, 404, 'only starting a visit makes a house');
  assert.equal((await fetch(`${slow.base}/h/${A}/demo/clock`)).status, 200);
  assert.equal((await fetch(`${slow.base}/h/${B}/demo/clock`)).status, 429);
  assert.equal((await fetch(`${slow.base}/h/${A}/health`)).status, 200, 'existing houses still work');
});

test('two plain MCP clients at /mcp each get a house of their own, kept for their session', async () => {
  const { base, houses } = await start();
  const plain = async () => {
    const c = new Client({ name: 'judge', version: '0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    servers.at(-1)!.clients.push(c);
    return async (name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as any;
  };
  const one = await plain();
  const two = await plain();
  const a = await one('start_handoff', { carer_name: 'Priya' });
  const b = await two('start_handoff', { carer_name: 'Sam' });
  assert.notEqual(a.isError, true);
  assert.notEqual(b.isError, true, 'the second judge is not told a handoff is already running');
  assert.equal((await one('home_screen')).structuredContent.carer, 'Priya', 'the session keeps its own house');
  assert.equal((await two('home_screen')).structuredContent.carer, 'Sam');
  assert.equal(houses.houses.size, 2);
  const lost = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-session-id': 'not-a-session' }, body: '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' });
  assert.equal(lost.status, 404, 'an unknown session is told to start again');
});

test('ids that are not house ids fall through to the shared house', async () => {
  const { base } = await start();
  assert.equal((await fetch(`${base}/h/short/health`)).status, 404);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test('/version says which commit is running', async () => {
  const { base } = await start();
  const v = await (await fetch(`${base}/version`)).json();
  assert.equal(typeof v.commit, 'string');
  assert.ok(Date.parse(v.started_at));
});

test('the public demo keeps goodnight recordings small and few (every house shares the memory)', async () => {
  const { base } = await start();
  const upload = (bytes: number) =>
    fetch(`${base}/h/${A}/parent/api/messages?k=${KEY}&by=Anita`, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: Buffer.alloc(bytes, 1) });
  assert.equal((await upload(3_500_000)).status, 413, 'over 3 MB');
  for (let i = 0; i < 3; i++) assert.equal((await upload(10_000)).status, 200);
  const s = await (await fetch(`${base}/h/${A}/parent/api/state?k=${KEY}`)).json();
  assert.equal(s.messages.length, 2, 'two kept per house');
});

test('a real phone with the parent page open is counted in its own house only', async () => {
  const { base } = await start();
  const presence = async (id: string, k = KEY) => (await fetch(`${base}/h/${id}/parent/api/presence?k=${k}`)).json();
  assert.equal((await fetch(`${base}/h/${A}/parent/api/presence?k=wrong`)).status, 401);
  assert.deepEqual(await presence(A), { phones: 0 });
  // The demo's phone frame polls without "solo"; it is not a real phone.
  await fetch(`${base}/h/${A}/parent/api/state?k=${KEY}`);
  assert.deepEqual(await presence(A), { phones: 0 });
  await fetch(`${base}/h/${A}/parent/api/state?k=${KEY}&solo=phone1`);
  await fetch(`${base}/h/${A}/parent/api/state?k=${KEY}&solo=phone1`);
  await fetch(`${base}/h/${A}/parent/api/state?k=${KEY}&solo=..%2Fx`);
  assert.deepEqual(await presence(A), { phones: 1 }, 'the same phone counts once; malformed ids are ignored');
  assert.deepEqual(await presence(B), { phones: 0 }, 'another house sees no phones');
});

test('every demo house has a parent key of its own: one house\'s parent link never opens another\'s', async () => {
  const { demoHouse } = await import('../src/index.js');
  const houses = createHouses(demoHouse({ ai: { available: false } as any, demo: true }), { publicUrl: 'http://demo.test' });
  const http = houses.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  try {
    const keyOf = async (id: string) => new URL((await (await fetch(`${base}/h/${id}/demo/config`)).json()).parent_url, base).searchParams.get('k')!;
    const a = 'a'.repeat(32);
    const b = 'b'.repeat(32);
    const ka = await keyOf(a);
    const kb = await keyOf(b);
    assert.ok(ka.length >= 20 && kb.length >= 20);
    assert.notEqual(ka, kb);
    assert.equal((await fetch(`${base}/h/${a}/parent/api/state?k=${ka}`)).status, 200);
    assert.equal((await fetch(`${base}/h/${b}/parent/api/state?k=${ka}`)).status, 401, "house A's key is refused by house B");
  } finally {
    houses.close();
    http.closeAllConnections();
    http.close();
  }
});
