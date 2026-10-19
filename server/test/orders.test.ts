// Ordering dinner across three services: a delivery partner's menu filtered by the family's
// allergies and rules, a parent's approval on their phone (the sitter can't spend), and the front
// door, which then expects the delivery. Plus what must never happen: an unsafe dish ordered by
// name, an order without a parent, a stranger approving.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { safeMenu } from '../src/domain/orders.js';
import type { PushSender } from '../src/domain/push.js';

const KEY = 'orders-test-key';
const TZ = 'America/Los_Angeles';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
const sent: any[] = [];
const sender: PushSender = async (_sub, payload) => (sent.push(JSON.parse(payload)), { statusCode: 201 });
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const said = (r: any) => r.content.find((c: any) => c.type === 'text')?.text ?? '';
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });
const state = async () => (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
const settle = () => new Promise((r) => setTimeout(r, 30));

before(async () => {
  const created = createApp({ parentKey: KEY, demo: true, pushSender: sender, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'orders-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  await post('/parent/api/push/subscribe', { subscription: { endpoint: 'https://push.example.com/anita', keys: { p256dh: 'x'.repeat(87), auth: 'auth-secret-16b' } }, member: 'Anita' });
});

after(async () => {
  resetClock();
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('the menu offers only what is safe: no peanuts, nothing that "may contain nuts", no sweets after 6 pm', () => {
  setDemoTime('18:20', TZ, 'Sat');
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  const m = safeMenu(db);
  const offered = m.options.map((o) => o.name);
  assert.ok(offered.length >= 1 && offered.length <= 3, 'a carousel of 3 at most');
  for (const unsafe of ['Chicken satay skewers', 'Pad thai', 'Sesame noodles', 'Chocolate brownie', 'Sugar cookie']) assert.ok(!offered.includes(unsafe), unsafe);
  const why = Object.fromEntries(m.left_out.map((l) => [l.name, l.why]));
  assert.equal(why['Chicken satay skewers'], 'contains peanut');
  assert.equal(why['Sesame noodles'], 'may contain nuts');
  assert.equal(why['Sugar cookie'], 'no sweets after 6:00 pm');
  // Before the parents' cut-off, a cookie is fine; a brownie that may contain nuts never is.
  setDemoTime('17:00', TZ, 'Sat');
  const early = safeMenu(db);
  assert.ok(!early.left_out.some((l) => l.name === 'Sugar cookie'));
  assert.equal(early.left_out.find((l) => l.name === 'Chocolate brownie')?.why, 'may contain nuts');
  // A craving moves a safe dish to the front.
  setDemoTime('18:20', TZ, 'Sat');
  assert.equal(safeMenu(db, 'pizza').options[0].name, 'Margherita pizza');
});

test('the sitter asks, a parent approves on their phone, and the door expects the delivery', async () => {
  setDemoTime('18:20', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  const menu = await call('order_dinner', {});
  assert.equal(menu.structuredContent.view, 'menu');
  assert.match(said(menu), /^I've left out 5 dishes that aren't safe for Maya\. .* Which one\? A parent approves the order\.$/);

  sent.splice(0);
  const asked = await call('request_order', { item: 'the mac and cheese' });
  assert.equal(asked.structuredContent.view, 'order');
  assert.equal(asked.structuredContent.status, 'pending');
  assert.match(said(asked), /^I've sent the mac and cheese, \$11, to Anita to approve\./);
  await settle();
  assert.equal(sent.at(-1).title, 'Priya wants to order dinner', "Mom's phone is asked");
  assert.match(sent.at(-1).body, /Mac and cheese, \$11 .*Allergy-checked/);

  const s = await state();
  assert.equal(s.order.status, 'pending');
  assert.equal((await post('/parent/api/order', { k: 'wrong', id: s.order.id, action: 'approve' })).status, 401, 'only a parent can approve');
  const ok = await (await post('/parent/api/order', { id: s.order.id, action: 'approve', by: 'Anita' })).json();
  assert.equal(ok.status, 'approved');
  assert.equal(ok.arrives, '6:45 pm to 7:00 pm');
  assert.match(ok.reference, /^CK-\d{4}$/);

  // The sitter hears it on her next reply, the card can refresh itself, the door expects it.
  const heard = await call('ask_house', { question: 'Where are the plates?' });
  assert.match(said(heard), /^Anita ordered the mac and cheese\. It arrives between 6:45 pm and 7:00 pm\./);
  assert.equal((await call('order_status', { id: s.order.id })).structuredContent.status, 'approved');
  const after = await state();
  assert.ok(after.visitors.some((v: any) => v.name === 'Dinner from Corner Kitchen' && v.kind === 'delivery'));
  assert.ok(after.audit.some((a: any) => /^Ordered Mac and cheese \(\$11\)$/.test(a.action) && a.via === "Anita's phone"));
  assert.ok(after.audit.some((a: any) => a.action === 'Asked to order the mac and cheese' && a.actor === 'Priya'));

  setDemoTime('18:50', TZ, 'Sat');
  await post('/demo/ring', { who: 'delivery' });
  const door = await call('door_check', { question: 'Someone is at the door, is that our dinner?' });
  assert.equal(door.structuredContent.verdict, 'delivery');
  assert.match(said(door), /Dinner from Corner Kitchen, due 6:45 pm to 7:00 pm\. No need to open/);
  await call('end_handoff');
});

test('an unsafe dish asked for by name is refused, and nothing is sent to the parents', async () => {
  setDemoTime('18:20', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  sent.splice(0);
  const r = await call('request_order', { item: 'the pad thai' });
  assert.equal(r.structuredContent.view, 'menu');
  assert.match(said(r), /^Pad thai isn't safe tonight: contains peanut\. Pick another one\?/);
  const cookie = await call('request_order', { item: 'a sugar cookie' });
  assert.match(said(cookie), /isn't safe tonight: no sweets after 6:00 pm/);
  await settle();
  assert.ok(!sent.some((m) => /order dinner/.test(m.title)), 'no request reached a phone');
  await call('end_handoff');
});

test('a parent can say not tonight; the sitter is told', async () => {
  setDemoTime('18:20', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  await call('request_order', { item: 'pizza' });
  const s = await state();
  const no = await (await post('/parent/api/order', { id: s.order.id, action: 'decline', by: 'Rahul' })).json();
  assert.equal(no.status, 'declined');
  const heard = await call('ask_house', { question: 'Where are the plates?' });
  assert.match(said(heard), /^Rahul said not tonight to the margherita pizza\./);
  assert.equal((await post('/parent/api/order', { id: s.order.id, action: 'approve' })).status, 409, 'a declined order stays declined');
  await call('end_handoff');
});
