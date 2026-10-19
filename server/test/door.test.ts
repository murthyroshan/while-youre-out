// Front Door Guard: the doorbell, tonight's expected visitors, deliveries and the parents' rule.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { endHandoff, startHandoff } from '../src/domain/house.js';
import { addVisitor, clearVisitors, doorCheck, parseWindow, recordDoorEvent, visitors, VisitorError } from '../src/domain/door.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';
import type { PushSender } from '../src/domain/push.js';

const TZ = 'America/Los_Angeles';
const fresh = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};
after(() => resetClock());

test('reads the times parents write: ranges, "around", "after", evenings by default', () => {
  assert.deepEqual(parseWindow('7-8 pm'), { from: 19 * 60, to: 20 * 60 });
  assert.deepEqual(parseWindow('6:30–7'), { from: 18 * 60 + 30, to: 19 * 60 });
  assert.deepEqual(parseWindow('around 7'), { from: 18 * 60 + 30, to: 19 * 60 + 30 });
  assert.deepEqual(parseWindow('after 8'), { from: 20 * 60, to: null });
  assert.deepEqual(parseWindow('tonight'), { from: null, to: null });
  assert.deepEqual(parseWindow(null), { from: null, to: null });
});

test('nobody at the camera: says so, with who is expected and the parents\' rule', () => {
  setDemoTime('19:00', TZ, 'Sat');
  const c = doorCheck(fresh());
  assert.equal(c.verdict, 'no_event');
  assert.match(c.say, /don't see anyone/);
  assert.match(c.say, /Nani/);
  assert.match(c.say, /Rahul's rule: "Don't open the door to anyone you don't know/);
  assert.equal(c.ask_parent, null);
});

test('a delivery: no need to open, using the delivery window the parents gave', () => {
  setDemoTime('19:20', TZ, 'Sat');
  const db = fresh();
  startHandoff(db, 'Priya');
  recordDoorEvent(db, { kind: 'package', snapshot_url: '/static/door/delivery.jpg' });
  const c = doorCheck(db);
  assert.equal(c.verdict, 'delivery');
  assert.match(c.say, /No need to open: the driver leaves it outside\./);
  assert.match(c.say, /Amazon package, due 7-8 pm/);
  assert.equal(c.ask_parent, null);
});

test('someone unknown: don\'t open, and the parents are asked urgently with the photo', () => {
  setDemoTime('21:30', TZ, 'Sat'); // Nani's "around 7" is long past
  const db = fresh();
  startHandoff(db, 'Priya');
  const ev = recordDoorEvent(db, { kind: 'person', snapshot_url: '/static/door/stranger.jpg' });
  const c = doorCheck(db);
  assert.equal(c.verdict, 'unknown');
  assert.match(c.say, /^Don't open the door/);
  assert.doesNotMatch(c.say, /safe/i);
  assert.deepEqual(c.ask_parent && [c.ask_parent.door_event_id, c.ask_parent.urgent], [ev.id, true]);
});

test('someone expected around now: check first, and the parents confirm', () => {
  setDemoTime('19:05', TZ, 'Sat');
  const db = fresh();
  startHandoff(db, 'Priya');
  recordDoorEvent(db, { kind: 'person', snapshot_url: '/static/door/grandma.jpg' });
  const c = doorCheck(db);
  assert.equal(c.verdict, 'expected');
  assert.match(c.say, /expect Nani \(around 7 pm\)/);
  assert.match(c.say, /Check through the window/);
  assert.match(c.ask_parent!.question, /Is this Nani at the front door/);
});

test('an old doorbell ring doesn\'t count as someone at the door now', () => {
  setDemoTime('19:00', TZ, 'Sat');
  const db = fresh();
  recordDoorEvent(db, { kind: 'person' });
  setDemoTime('19:30', TZ, 'Sat');
  assert.equal(doorCheck(db).verdict, 'no_event');
});

test('the visitor list: checks input, and is cleared when the evening ends', () => {
  const db = fresh();
  assert.throws(() => addVisitor(db, { name: ' ' }), VisitorError);
  const v = addVisitor(db, { name: 'Pizza from Tony’s', kind: 'delivery', window: '6:30-7' }, 'Rahul');
  assert.deepEqual([v.kind, v.from_minutes, v.to_minutes, v.added_by], ['delivery', 18 * 60 + 30, 19 * 60, 'Rahul']);
  startHandoff(db, 'Priya');
  endHandoff(db);
  assert.equal(visitors(db).length, 0);
  clearVisitors(db);
});

// ---------- end to end: the doorbell rings, the parent answers from the lock screen ----------

const KEY = 'door-test-key';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
const sent: Array<{ endpoint: string; msg: any }> = [];
const sender: PushSender = async (sub, payload) => (sent.push({ endpoint: sub.endpoint, msg: JSON.parse(payload) }), { statusCode: 201 });
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });

before(async () => {
  const created = createApp({ parentKey: KEY, escalateAfterMs: 60_000, pushSender: sender, demo: true, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'door-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('doorbell → door_check → photo on the parent\'s lock screen → "let them in" → the device hears it', async () => {
  setDemoTime('21:30', TZ, 'Sat');
  await post('/parent/api/push/subscribe', { subscription: { endpoint: 'https://push.example.com/anita', keys: { p256dh: 'x'.repeat(87), auth: 'auth-secret-16b' } }, member: 'Anita' });
  await client.callTool({ name: 'start_handoff', arguments: { carer_name: 'Priya' } });
  const rang = await (await post('/demo/ring', { who: 'stranger' })).json();
  assert.equal(rang.snapshot_url, '/static/door/stranger.jpg');

  const check = (await client.callTool({ name: 'door_check', arguments: { question: "Someone's knocking, should I open?" } })) as any;
  assert.equal(check.structuredContent.view, 'door');
  assert.equal(check.structuredContent.verdict, 'unknown');
  assert.match(check.structuredContent.event.snapshot_url, /^http.*\/static\/door\/stranger\.jpg$/);
  const ask = check.structuredContent.ask_parent;

  sent.splice(0);
  await client.listTools();
  const stream = client.experimental.tasks.callToolStream({ name: 'ask_parent_and_wait', arguments: { question: ask.question, door_event_id: ask.door_event_id } });
  const result = (async () => {
    for await (const m of stream) if (m.type === 'result') return m.result as any;
  })();
  const deadline = Date.now() + 3000;
  while (!sent.length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  const n = sent[0].msg;
  assert.match(n.title, /someone's at the front door/);
  assert.equal(n.image, '/static/door/stranger.jpg');
  assert.equal(n.urgent, true);
  assert.equal(n.by, 'Anita');
  assert.deepEqual(n.actions.map((a: any) => a.title), ['Let them in', "Don't open"]);

  // The parent taps "Let them in" on the notification: the service worker posts this.
  const state = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  assert.equal(state.questions[0].door_snapshot, '/static/door/stranger.jpg');
  await post('/parent/api/answer', { id: n.question_id, answer: n.actions[0].answer, by: n.by, scope: 'tonight' });
  const final = await result;
  assert.match(final.content[0].text, /Anita said: "It's fine, you can let them in\."/);
  assert.match(final.structuredContent.door_snapshot, /stranger\.jpg$/);

  const again = (await client.callTool({ name: 'door_check', arguments: {} })) as any;
  assert.equal(again.structuredContent.verdict, 'parent_decided');
  const home = (await client.callTool({ name: 'home_screen', arguments: {} })) as any;
  assert.match(home.structuredContent.door.decision, /Anita: "It's fine/);
});

test('the parent page manages tonight\'s visitors', async () => {
  const added = await (await post('/parent/api/visitors', { action: 'add', name: 'Pizza', kind: 'delivery', window: '8-8:30', by: 'Rahul' })).json();
  const pizza = added.visitors.find((v: any) => v.name === 'Pizza');
  assert.equal(pizza.added_by, 'Rahul');
  assert.equal((await post('/parent/api/visitors', { action: 'add', name: '' })).status, 400);
  const removed = await (await post('/parent/api/visitors', { action: 'remove', id: pizza.id })).json();
  assert.ok(!removed.visitors.some((v: any) => v.name === 'Pizza'));
  assert.equal((await post('/parent/api/visitors', { k: 'nope', action: 'add', name: 'x' })).status, 401);
  assert.equal((await post('/demo/ring', { who: 'bear' })).status, 400);
});
