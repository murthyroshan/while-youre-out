// The parent's phone: push notifications, photos from home, and family setup / reset.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../src/index.js';
import type { PushSender } from '../src/domain/push.js';
import { parseFamily, FamilyError } from '../src/domain/family.js';

const KEY = 'phone-test-key';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
let db: ReturnType<typeof createApp>['db'];

// The fake push service: records what each phone would receive; some endpoints are "gone".
const sent: Array<{ endpoint: string; msg: any; urgency?: string }> = [];
const gone = new Set<string>();
const sender: PushSender = async (sub, payload, options) => {
  if (gone.has(sub.endpoint)) throw Object.assign(new Error('Gone'), { statusCode: 410 });
  sent.push({ endpoint: sub.endpoint, msg: JSON.parse(payload), urgency: options.urgency });
  return { statusCode: 201 };
};

const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });
const state = async () => (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
const settle = () => new Promise((r) => setTimeout(r, 30));
const phone = (name: string) => ({ endpoint: `https://push.example.com/${name}`, keys: { p256dh: 'BPk'.padEnd(87, 'x'), auth: 'auth-secret-16b' } });
const to = (name: string) => sent.filter((s) => s.endpoint.endsWith(`/${name}`));
const reset = () => void sent.splice(0);

before(async () => {
  const created = createApp({ parentKey: KEY, escalateAfterMs: 300, pushSender: sender, ai: { available: false } as any });
  close = created.close;
  db = created.db;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'phone-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

// ---------- push notifications ----------

test('phones subscribe with the parent key only, and bad subscriptions are refused', async () => {
  assert.equal((await fetch(`${base}/parent/api/push/key?k=wrong`)).status, 401);
  const { publicKey } = await (await fetch(`${base}/parent/api/push/key?k=${KEY}`)).json();
  assert.match(publicKey, /^[A-Za-z0-9_-]{80,}$/);
  assert.equal((await post('/parent/api/push/subscribe', { subscription: { endpoint: 'http://insecure', keys: {} } })).status, 400);
  assert.equal((await post('/parent/api/push/subscribe', { k: 'wrong', subscription: phone('x') })).status, 401);
  assert.equal((await post('/parent/api/push/subscribe', { subscription: phone('anita'), member: 'Anita' })).status, 200);
  assert.equal((await post('/parent/api/push/subscribe', { subscription: phone('rahul'), member: 'Rahul' })).status, 200);
});

test('a test notification reaches just the phone that asked for it', async () => {
  reset();
  const r = await (await post('/parent/api/push/test', { endpoint: phone('rahul').endpoint })).json();
  assert.equal(r.sent, 1);
  assert.equal(to('rahul').length, 1);
  assert.equal(to('anita').length, 0);
});

test('a small question buzzes the first contact only, with a link back to the page', async () => {
  await call('start_handoff', { carer_name: 'Priya' });
  reset();
  await call('ask_parent', { question: 'Can she play with the play-doh?' });
  await settle();
  assert.equal(to('anita').length, 1);
  assert.equal(to('rahul').length, 0);
  const m = to('anita')[0].msg;
  assert.equal(m.title, 'Priya asks');
  assert.match(m.body, /play-doh/);
  assert.equal(m.url, `/parent?k=${KEY}`);
  assert.ok(!m.urgent);
});

test('urgent questions and allergen alerts buzz every phone, marked urgent', async () => {
  reset();
  await call('ask_parent', { question: 'Can I give her some Calpol?' });
  await call('log_event', { text: 'She ate a Snickers bar' });
  await settle();
  assert.equal(to('anita').length, 2);
  assert.equal(to('rahul').length, 2);
  assert.ok(sent.every((s) => s.msg.urgent && s.urgency === 'high'));
  assert.ok(sent.some((s) => /Snickers/.test(s.msg.body)));
});

test('busy mode: small questions stay quiet, urgent ones still come through', async () => {
  await post('/parent/api/busy', { minutes: 60 });
  reset();
  await call('ask_parent', { question: 'Can she paint in the kitchen?' });
  await call('ask_parent', { question: 'Can I give her some medicine for her cough?' });
  await settle();
  assert.equal(sent.filter((s) => /paint/.test(s.msg.body)).length, 0);
  assert.ok(sent.some((s) => /medicine/.test(s.msg.body)));
  await post('/parent/api/busy', { minutes: 0 });
});

test('when the first contact does not answer, the next one gets the notification', async () => {
  reset();
  await client.listTools();
  const stream = client.experimental.tasks.callToolStream({ name: 'ask_parent_and_wait', arguments: { question: 'Can she have a bath tonight?' } });
  const statuses: string[] = [];
  const watcher = (async () => {
    for await (const m of stream) {
      if (m.type === 'taskStatus') statuses.push(m.task.statusMessage ?? '');
      if (m.type === 'result') return;
    }
  })();
  const deadline = Date.now() + 5000;
  while (!to('rahul').length && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
  assert.equal(to('anita')[0]?.msg.title, 'Priya asks');
  assert.match(to('rahul')[0]?.msg.title ?? '', /no answer yet/);
  const q = (await state()).questions.find((x: any) => /bath/.test(x.text));
  await post('/parent/api/answer', { id: q.id, answer: "Yes, that's fine.", by: 'Rahul' });
  await watcher;
});

test('an emergency buzzes every phone and stays on screen', async () => {
  reset();
  await call('emergency', { description: "She can't breathe" });
  await settle();
  assert.equal(sent.length, 2);
  for (const s of sent) {
    assert.equal(s.msg.title, 'Emergency at home');
    assert.equal(s.msg.urgent, true);
    assert.equal(s.msg.tag, 'emergency');
    assert.match(s.msg.body, /Priya said: "She can't breathe"/);
  }
});

test('a phone that unsubscribed is forgotten; if the named person has no phone, everyone hears it', async () => {
  gone.add(phone('anita').endpoint);
  reset();
  await call('ask_parent', { question: 'Can she go to the park?' });
  await settle();
  // Anita's phone is gone (410) and removed.
  const left = (db.prepare('SELECT member FROM push_subscriptions').all() as Array<{ member: string }>).map((r) => r.member);
  assert.deepEqual(left, ['Rahul']);
  reset();
  await call('ask_parent', { question: 'Can she have a friend over?' });
  await settle();
  // Questions for Anita now reach Rahul's phone rather than nobody.
  assert.equal(to('rahul').length, 1);
  gone.clear();
  await post('/parent/api/push/subscribe', { subscription: phone('anita'), member: 'Anita' });
});

// ---------- family setup ----------

test('family form checks: a name, a real time zone, someone to call, sensible phones', () => {
  const ok = { household: { name: 'The Okoro family', address: '1 Elm St', timezone: 'Africa/Lagos' }, members: [], contacts: [{ name: 'Ada', relation: 'Mom', phone: '+234 803 555 0101' }] };
  assert.equal(parseFamily(ok).household.timezone, 'Africa/Lagos');
  const bad = (patch: object, msg: RegExp) => assert.throws(() => parseFamily({ ...ok, ...patch }), (e: any) => e instanceof FamilyError && msg.test(e.message));
  bad({ household: { ...ok.household, name: ' ' } }, /name/);
  bad({ household: { ...ok.household, timezone: 'Mars/Olympus' } }, /time zone/);
  bad({ contacts: [] }, /at least one person/);
  bad({ contacts: [{ name: 'Dr. Ade', relation: 'Doctor', phone: '555 0101 22', doctor: true }] }, /not only a doctor/);
  bad({ contacts: [{ name: 'Ada', relation: 'Mom', phone: 'call me' }] }, /phone number/);
  bad({ members: [{ name: 'Tobi', kind: 'robot' }] }, /child or a pet/);
  bad({ members: [{ name: 'Tobi', kind: 'child' }, { name: 'tobi', kind: 'pet' }] }, /same name/);
});

test('editing the family: renames keep the rules, allergies are saved in the parent\'s words, order sets who is asked first', async () => {
  const fam = await (await fetch(`${base}/parent/api/family?k=${KEY}`)).json();
  assert.equal(fam.household.name, 'The Sharma family');
  assert.match(fam.members.find((m: any) => m.name === 'Maya').allergies, /peanuts/);
  const maya = fam.members.find((m: any) => m.name === 'Maya');
  maya.name = 'Mia';
  fam.members.push({ name: 'Arjun', kind: 'child', age: '2', allergies: 'eggs' });
  // Rahul first now.
  fam.contacts = [fam.contacts[1], fam.contacts[0], ...fam.contacts.slice(2)];
  const r = await post('/parent/api/family', { family: fam, by: 'Anita' });
  assert.equal(r.status, 200, JSON.stringify(await r.clone().json()));
  const saved = await r.json();
  assert.match(saved.members.find((m: any) => m.name === 'Mia').allergies, /peanuts/, 'the allergy followed the rename');
  assert.equal(saved.members.find((m: any) => m.name === 'Arjun').allergies, 'Arjun is allergic to eggs.');
  assert.deepEqual(saved.contacts.map((c: any) => c.name).slice(0, 2), ['Rahul', 'Anita']);
  assert.equal(saved.contacts.find((c: any) => c.name === 'Dr. Okafor').doctor, true);
  // The house answers with the new names and the new allergy.
  const food = await call('ask_house', { question: 'Can Arjun have an omelette?' });
  assert.ok(food.structuredContent.facts.some((f: any) => f.text === 'Arjun is allergic to eggs.'));
  assert.equal((await state()).parents[0], 'Rahul');
  const badSave = await post('/parent/api/family', { family: { ...saved, contacts: [] } });
  assert.equal(badSave.status, 400);
  assert.match((await badSave.json()).error, /at least one person/);
});

test('start fresh: an empty house still works end to end, and nothing says "null"', async () => {
  const r = await post('/parent/api/reset', { mode: 'fresh', timezone: 'Asia/Kolkata' });
  assert.equal(r.status, 200);
  const fam = await r.json();
  assert.deepEqual([fam.household.timezone, fam.members.length, fam.contacts.length], ['Asia/Kolkata', 0, 0]);
  const s = await state();
  assert.equal(s.handoff, null);
  assert.deepEqual([s.parents, s.questions], [[], []]);
  await call('start_handoff', { carer_name: 'Nani' });
  const tb = await call('teachback', {});
  assert.match(tb.content[0].text, /doesn't have anything to check yet/);
  const e = await call('emergency', { description: 'There is a fire in the kitchen' });
  assert.doesNotMatch(e.content[0].text, /null|undefined/);
  assert.equal(e.structuredContent.address, null);
  const end = await call('end_handoff', {});
  assert.doesNotMatch(end.content[0].text, /null|undefined/);
});

test('then setting up a new family: the teach-back, pets and contacts all use it', async () => {
  const family = {
    household: { name: 'The Okoro family', address: '7 Palm Avenue, Lekki, Lagos', timezone: 'Africa/Lagos' },
    members: [
      { name: 'Tobi', kind: 'child', age: '4', allergies: 'sesame' },
      { name: 'Biscuit', kind: 'pet', age: 'cat' },
    ],
    contacts: [
      { name: 'Ada', relation: 'Mom', phone: '+234 803 555 0101' },
      { name: 'Dr. Bello', relation: 'Pediatrician', phone: '+234 803 555 0199', doctor: true },
      { name: 'Chidi', relation: 'Dad', phone: '+234 803 555 0102' },
    ],
  };
  assert.equal((await post('/parent/api/family', { family })).status, 200);
  db.prepare("INSERT INTO facts (category, subject, text, source, author, created_at) VALUES ('pet', 'Biscuit', 'Biscuit gets half a pouch at 6.', 'voice', 'Ada', ?)").run(new Date().toISOString());
  await call('start_handoff', { carer_name: 'Nani' });
  const first = await call('teachback', {});
  assert.match(first.content[0].text, /What is Tobi allergic to\?/);
  const right = await call('teachback', { answer: 'sesame' });
  assert.match(right.content[0].text, /right/i);
  const pet = await call('ask_house', { question: 'Has Biscuit been fed?' });
  assert.ok(pet.structuredContent.facts.some((f: any) => /half a pouch/.test(f.text)));
  const s = await state();
  assert.deepEqual(s.parents, ['Ada', 'Chidi'], 'the doctor is never asked questions');
  assert.equal(s.household.timezone, 'Africa/Lagos');
  const e = await call('emergency', { description: 'He fell and is bleeding a lot' });
  assert.match(e.content[0].text, /7 Palm Avenue/);
});

test('reset to the demo family: clean Sharma house, waiting questions closed, no leftover emergency', async () => {
  await client.listTools();
  const stream = client.experimental.tasks.callToolStream({ name: 'ask_parent_and_wait', arguments: { question: 'Can he stay up late?' } });
  const result = (async () => {
    for await (const m of stream) if (m.type === 'result') return m.result as any;
  })();
  await settle();
  assert.ok((await state()).emergency);
  const r = await post('/parent/api/reset', { mode: 'demo' });
  assert.equal((await r.json()).household.name, 'The Sharma family');
  const final = await result;
  assert.match(final.content[0].text, /The house was reset/);
  const s = await state();
  assert.deepEqual([s.handoff, s.emergency, s.questions.length], [null, null, 0]);
  assert.deepEqual(s.parents, ['Anita', 'Rahul', 'Mrs. Lee']);
  // Phones stay subscribed across a reset.
  assert.ok((db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get() as { n: number }).n >= 1);
  assert.equal((await post('/parent/api/reset', { mode: 'nuke' })).status, 400);
  assert.equal((await post('/parent/api/reset', { k: 'wrong', mode: 'demo' })).status, 401);
});

test('the service worker and the home-screen manifest are served', async () => {
  const sw = await fetch(`${base}/parent/sw.js`);
  assert.equal(sw.headers.get('service-worker-allowed'), '/parent');
  assert.match(await sw.text(), /showNotification/);
  assert.equal((await fetch(`${base}/parent/manifest.webmanifest?k=wrong`)).status, 401);
  const m = await (await fetch(`${base}/parent/manifest.webmanifest?k=${KEY}`)).json();
  assert.equal(m.start_url, `/parent?k=${KEY}`);
  assert.equal(m.display, 'standalone');
  assert.equal((await fetch(`${base}/static/icon-192.png`)).status, 200);
});
