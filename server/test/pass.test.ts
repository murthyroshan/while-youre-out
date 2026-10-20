// Guest Pass: the sitter's pass is issued with the handoff and shown as a QR code; it opens
// tonight on her phone (in the parents' words, with who to call and "ask the parents"); the parents
// can extend or end it; at its end time they are asked, and half an hour later it closes; it ends
// with the evening. Everything done under it is in the parents' activity log.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';
import { passTick } from '../src/domain/pass.js';
import type { PushSender } from '../src/domain/push.js';

const KEY = 'pass-test-key';
const TZ = 'America/Los_Angeles';
let http: Server;
let base: string;
let close: () => void;
let db: any;
let client: Client;
const sent: any[] = [];
const sender: PushSender = async (_sub, payload) => (sent.push(JSON.parse(payload)), { statusCode: 201 });
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });
const guest = (token: string, path: string, body?: Record<string, unknown>) =>
  fetch(`${base}/guest/api/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
const state = async () => (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
const settle = () => new Promise((r) => setTimeout(r, 30));
const tokenOf = (r: any) => new URL(r.structuredContent.pass.join_url).hash.slice(1);

before(async () => {
  const created = createApp({ parentKey: KEY, pushSender: sender, ai: { available: false } as any });
  close = created.close;
  db = created.db;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'pass-test', version: '0' });
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

test('the handoff issues a Guest Pass: a QR code on the briefing, never read aloud', async () => {
  setDemoTime('18:00', TZ, 'Sat');
  const r = await call('start_handoff', { carer_name: 'Priya' });
  const pass = r.structuredContent.pass;
  assert.equal(pass.carer, 'Priya');
  assert.equal(pass.ends, '11:00 pm', 'five hours by default');
  assert.match(pass.join_url, /\/guest#[\w-]{30,}$/, 'the token is in the fragment, not the query');
  assert.match(pass.qr_svg, /^<svg/);
  assert.doesNotMatch(r.content[0].text, /guest|http/i, 'the link is shown, not spoken');
  const page = await fetch(`${base}/guest`);
  assert.equal(page.status, 200);
  // In an emergency the sitter's phone puts a one-tap call to a parent under the step (a parent asked for it).
  assert.match(await page.text(), /class="sos call-parent" href="tel:/);
  await call('end_handoff');
});

test('the sitter opens it on her phone: tonight in the parents’ words, who to call, ask the parents', async () => {
  setDemoTime('18:00', TZ, 'Sat');
  const token = tokenOf(await call('start_handoff', { carer_name: 'Priya' }));
  assert.equal((await guest('x'.repeat(30), 'state')).status, 401, 'an unknown pass gets nothing');
  const s = await (await guest(token, 'state')).json();
  assert.equal(s.carer, 'Priya');
  assert.match(s.must_know[0], /allergic to peanuts/);
  assert.ok(s.contacts.some((c: any) => c.name === 'Anita' && c.phone), 'one tap to call Mom');
  assert.ok(s.next.length > 0);

  sent.splice(0);
  const asked = await (await guest(token, 'ask', { question: 'Can she stay up until 9 to finish her movie?' })).json();
  assert.equal(asked.status, 'pending');
  await settle();
  assert.equal(sent.at(-1).title, 'Priya asks', "the question reaches Mom's phone like any other");
  const after = await state();
  assert.ok(after.questions.some((q: any) => /finish her movie/.test(q.text)));
  // The activity log: opened on her phone, asked from it.
  assert.ok(after.audit.some((a: any) => a.action === 'Opened tonight’s pass' && a.via === "Priya's phone"));
  assert.ok(after.audit.some((a: any) => /Asked the parents “Can she stay up/.test(a.action)));
  assert.equal(after.pass.opened_on_phone, true);
  await call('end_handoff');
});

test('what is done on the kitchen Echo Show is in the activity log; card refreshes are not', async () => {
  setDemoTime('18:00', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  await call('ask_house', { question: 'Can Maya have the cookies on the counter?' });
  await call('home_screen');
  const log = (await state()).audit;
  const asked = log.find((a: any) => /Asked “Can Maya have the cookies/.test(a.action));
  assert.ok(asked, 'the question is logged');
  assert.equal(asked.actor, 'Priya');
  assert.equal(asked.via, 'the kitchen Echo Show');
  assert.match(asked.detail, /allergic to peanuts/, 'with what she was told');
  assert.ok(!log.some((a: any) => /Tonight$/.test(a.action)), 'the Tonight screen refreshing itself is not an action');
  await call('end_handoff');
  assert.ok((await state()).audit.some((a: any) => a.action === 'Ended tonight'));
});

test('an emergency typed on her phone points at 911 and the kitchen guide, and is not left as a question', async () => {
  setDemoTime('19:00', TZ, 'Sat');
  const token = tokenOf(await call('start_handoff', { carer_name: 'Priya' }));
  const before = (await state()).questions.length;
  const r = await (await guest(token, 'ask', { question: "She can't breathe" })).json();
  assert.equal(r.emergency, true);
  assert.equal((await state()).questions.length, before);
  await call('end_handoff');
});

test('a parent extends the pass or ends it; an ended pass lets nobody in', async () => {
  setDemoTime('18:00', TZ, 'Sat');
  const token = tokenOf(await call('start_handoff', { carer_name: 'Priya' }));
  const ext = await (await post('/parent/api/pass', { action: 'extend', minutes: 60, by: 'Anita' })).json();
  assert.equal(ext.ends, '12:00 am');
  assert.ok((await state()).audit.some((a: any) => a.action === "Extended Priya's pass to 12:00 am" && a.via === "Anita's phone"));
  assert.equal((await post('/parent/api/pass', { action: 'extend', minutes: 9999 })).status, 400);
  const ended = await (await post('/parent/api/pass', { action: 'end', by: 'Anita' })).json();
  assert.equal(ended.status, 'revoked');
  const r = await guest(token, 'state');
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, 'pass_ended');
  await call('end_handoff');
});

test('at its end time the parents are asked to extend it; half an hour later it closes by itself', async () => {
  setDemoTime('18:00', TZ, 'Sat');
  const token = tokenOf(await call('start_handoff', { carer_name: 'Priya' }));
  sent.splice(0);
  setDemoTime('22:59', TZ, 'Sat');
  passTick(db);
  await settle();
  assert.equal(sent.length, 0, 'not yet');
  setDemoTime('23:00', TZ, 'Sat');
  passTick(db);
  passTick(db);
  await settle();
  assert.deepEqual(sent.map((m) => m.title), ["Priya's pass ends now"], 'asked once');
  assert.equal((await guest(token, 'state')).status, 200, 'still open in the grace period');
  setDemoTime('23:30', TZ, 'Sat');
  passTick(db);
  assert.equal((await guest(token, 'state')).status, 403);
  assert.ok((await state()).audit.some((a: any) => a.action === "Priya's pass closed"));
  await call('end_handoff');
});

test('the pass ends with the evening', async () => {
  setDemoTime('18:00', TZ, 'Sat');
  const token = tokenOf(await call('start_handoff', { carer_name: 'Priya' }));
  assert.equal((await guest(token, 'state')).status, 200);
  await call('end_handoff');
  assert.equal((await guest(token, 'state')).status, 403);
  assert.equal((await state()).pass.status, 'ended');
});
