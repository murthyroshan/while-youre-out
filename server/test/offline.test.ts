// When the internet drops: the sitter's phone keeps every emergency guide (the parents' plan and the
// general safety steps) and the page itself, and during an emergency it shows, and moves, the same
// guide as the kitchen Echo Show.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';
import { GUEST_HTML, GUEST_SW_JS } from '../src/guest/page.js';

const KEY = 'offline-test-key';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
let token = '';
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const guest = (path: string, body?: Record<string, unknown>, t = token) =>
  fetch(`${base}/guest/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${t}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

before(async () => {
  const created = createApp({ parentKey: KEY, demo: true, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'offline-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  setDemoTime('19:00', 'America/Los_Angeles', 'Sat');
  const h = await call('start_handoff', { carer_name: 'Priya', language: 'en' });
  token = new URL(h.structuredContent.pass.join_url).hash.slice(1);
});

after(async () => {
  resetClock();
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('the phone keeps every guide: the parents\' own plan for an allergic reaction, safety steps for the rest', async () => {
  const s = await (await guest('state')).json();
  const kinds = s.guides.map((g: any) => g.kind);
  assert.deepEqual(kinds, ['allergy_breathing', 'choking', 'fire', 'gas', 'poison', 'missing', 'intruder', 'general']);
  const allergy = s.guides[0];
  assert.match(allergy.source, /doctor's plan/);
  assert.match(allergy.steps[0], /EpiPen/);
  assert.ok(allergy.steps.some((t: string) => /911/.test(t)));
  assert.match(s.guides.find((g: any) => g.kind === 'fire').steps[0], /out now/);
  assert.equal(s.guides.find((g: any) => g.kind === 'poison').poison_line, '1-800-222-1222');
  assert.equal(s.guides.find((g: any) => g.kind === 'missing').label, "Can't find Maya");
  assert.equal(s.incident, null);
  assert.ok(s.address && s.contacts.length, 'what the phone keeps: the address and who to call');
});

test('in an emergency the phone shows the kitchen\'s guide, and "Done" on the phone moves both', async () => {
  await call('emergency', { description: "Maya's lips are swelling" });
  let s = await (await guest('state')).json();
  assert.equal(s.incident.status, 'active');
  assert.equal(s.incident.current, 0);
  assert.match(s.incident.steps[0].text, /EpiPen/);
  const r = await guest('emergency', { action: 'done' });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).current, 1);
  const kitchen = await call('emergency_status');
  assert.equal(kitchen.structuredContent.incident.current, 1, 'the Echo Show follows the phone');
  const parent = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  assert.ok(parent.audit.some((a: any) => a.action === 'Emergency guide: done' && a.via === "Priya's phone"));
  assert.equal((await guest('emergency', { action: 'jump' })).status, 400);
  assert.equal((await guest('emergency', { action: 'done' }, 'not-a-pass')).status, 401);
  await guest('emergency', { action: 'resolved' });
  s = await (await guest('state')).json();
  assert.equal(s.incident, null);
  assert.equal((await guest('emergency', { action: 'done' })).status, 404, 'nothing to move once it is over');
});

test('the page and its service worker: kept for offline, only for the sitter\'s page, deleted when the pass ends', async () => {
  const sw = await fetch(`${base}/guest/sw.js`);
  assert.equal(sw.status, 200);
  assert.equal(sw.headers.get('service-worker-allowed'), '/guest');
  assert.match(sw.headers.get('content-type') ?? '', /javascript/);
  assert.match(GUEST_SW_JS, /mode !== 'navigate'/, 'only the page itself is cached, never the API');
  assert.match(GUEST_HTML, /serviceWorker\.register\('guest\/sw\.js', \{ scope: 'guest' \}\)/);
  assert.match(GUEST_HTML, /localStorage\.removeItem\(SAVE\)/, 'what the phone kept is deleted when the pass ends');
  assert.match(GUEST_HTML, /delete k\.questions/, "the parents' answers aren't kept on the phone");
});

test('a step done while the kitchen screen was offline counts from when it was really done', async () => {
  setDemoTime('20:00', 'America/Los_Angeles', 'Sat');
  const e = await call('emergency', { description: "She can't breathe after eating a cookie" });
  const started = Date.parse(e.structuredContent.incident.started_at);
  const timed = e.structuredContent.incident.steps.find((x: any) => x.timer_seconds);
  assert.equal(timed.timer_label, 'Second EpiPen', 'the screen knows what to call the timer it starts offline');
  // The EpiPen was given a minute in; the screen got its connection back at three minutes.
  setDemoTime('20:03', 'America/Los_Angeles', 'Sat');
  const r = await call('emergency_step', { action: 'done', done_at: new Date(started + 60_000).toISOString() });
  const timer = r.structuredContent.incident.timers[0];
  assert.equal(Date.parse(timer.ends_at), started + 60_000 + timed.timer_seconds * 1000, 'five minutes from when it was given');
  assert.ok(Math.abs(timer.remaining_seconds - (timed.timer_seconds - 120)) <= 61, 'about three minutes left, not five');
  await call('emergency_step', { action: 'resolved' });
  setDemoTime('19:00', 'America/Los_Angeles', 'Sat');
});
