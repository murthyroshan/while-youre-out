// Emergency Copilot: the guide one step at a time, the plan's timers, and the parents in step.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { startHandoff } from '../src/domain/house.js';
import { startEmergency } from '../src/domain/emergency.js';
import { activeIncident, markOnTheWay, stepIncident, takeIncidentAnnouncements } from '../src/domain/incident.js';
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

test('an emergency opens a guide at step 1; a second report adds to it instead of starting over', () => {
  setDemoTime('19:30', TZ, 'Sat');
  const db = fresh();
  startHandoff(db, 'Priya');
  const e = startEmergency(db, "Her lips are swelling and she can't breathe");
  assert.equal(e.incident.current, 0);
  assert.equal(e.incident.total, 5);
  assert.equal(e.incident.steps[0].state, 'now');
  startEmergency(db, 'Now she is vomiting too');
  const i = activeIncident(db)!;
  assert.equal(i.id, e.incident.id);
  assert.match(i.updates.at(-1)!.text, /Also reported: "Now she is vomiting too"/);
});

test('finishing step 1 starts the plan\'s 5-minute timer; the device warns at 1 minute and at the end', () => {
  setDemoTime('19:30', TZ, 'Sat');
  const db = fresh();
  startHandoff(db, 'Priya');
  startEmergency(db, "She can't breathe");
  const i = stepIncident(db, 'done')!;
  assert.equal(i.current, 1);
  assert.equal(i.timers.length, 1);
  assert.equal(i.timers[0].label, 'Second EpiPen');
  assert.equal(i.timers[0].seconds, 300);
  assert.deepEqual(takeIncidentAnnouncements(db), []);
  setDemoTime('19:34', TZ, 'Sat');
  assert.deepEqual(takeIncidentAnnouncements(db), ['One minute left on the second epipen timer.']);
  assert.deepEqual(takeIncidentAnnouncements(db), [], 'said once');
  setDemoTime('19:35', TZ, 'Sat');
  const [end] = takeIncidentAnnouncements(db);
  assert.match(end, /^It's been 5 minutes\. If she is not better after 5 minutes, use the second EpiPen/);
});

test('steps go forward, back, and the guide ends when the carer says it is over', () => {
  setDemoTime('19:30', TZ, 'Sat');
  const db = fresh();
  startHandoff(db, 'Priya');
  startEmergency(db, "She can't breathe");
  stepIncident(db, 'done');
  stepIncident(db, 'next');
  assert.equal(activeIncident(db)!.current, 2);
  stepIncident(db, 'back');
  assert.equal(activeIncident(db)!.current, 1);
  for (let n = 0; n < 10; n++) stepIncident(db, 'done');
  assert.equal(activeIncident(db)!.current, 5, 'never past the last step');
  const over = stepIncident(db, 'resolved')!;
  assert.equal(over.status, 'resolved');
  assert.equal(activeIncident(db), undefined);
  assert.equal(stepIncident(db, 'done'), undefined);
});

test('a parent on the way is shown with a time they will be home', () => {
  setDemoTime('19:30', TZ, 'Sat');
  const db = fresh();
  startEmergency(db, "She can't breathe");
  const i = markOnTheWay(db, 'Anita', 15)!;
  assert.deepEqual(i.on_the_way.map((o) => [o.name, o.minutes]), [['Anita', 15]]);
  assert.equal(markOnTheWay(db, 'Anita', 10)!.on_the_way.length, 1, 'updates rather than adds');
});

// ---------- over MCP, the parent page and push ----------

const KEY = 'incident-test-key';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
const sent: any[] = [];
const sender: PushSender = async (_sub, payload) => (sent.push(JSON.parse(payload)), { statusCode: 201 });
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });
const settle = () => new Promise((r) => setTimeout(r, 30));

before(async () => {
  const created = createApp({ parentKey: KEY, pushSender: sender, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'incident-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  await post('/parent/api/push/subscribe', { subscription: { endpoint: 'https://push.example.com/anita', keys: { p256dh: 'x'.repeat(87), auth: 'auth-secret-16b' } }, member: 'Anita' });
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('end to end: emergency → "done" → the phones follow → "on my way" reaches the screen → "it\'s over"', async () => {
  setDemoTime('19:30', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  const e = await call('emergency', { description: "Her lips are swelling and she can't breathe" });
  assert.equal(e.structuredContent.incident.current, 0);

  sent.splice(0);
  const s1 = await call('emergency_step', { action: 'done' });
  assert.match(s1.content[0].text, /^Next, step 2 of 5: Call 911.*I've started a 5-minute timer\.$/);
  assert.equal(s1.structuredContent.incident.timers[0].remaining_seconds, 300);
  await settle();
  assert.equal(sent.at(-1).title, 'Emergency · step 1 of 5 done');
  assert.match(sent.at(-1).body, /Priya: Done: If Maya has trouble breathing.*5-minute timer started\./);
  assert.equal(sent.at(-1).tag, 'emergency');

  const state = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  assert.equal(state.incident.current, 1);
  assert.equal(state.incident.carer, 'Priya');
  assert.equal((await post('/parent/api/incident', { action: 'on_the_way', minutes: 15, by: 'Anita' })).status, 200);
  const heard = await call('emergency_status', { announce: true });
  assert.deepEqual(heard.structuredContent.announce, ['Anita is on the way home, about 15 minutes.']);
  const status = await call('emergency_status');
  assert.deepEqual(status.structuredContent.incident.on_the_way.map((o: any) => o.name), ['Anita']);
  assert.equal(status.structuredContent.active, true);
  assert.equal(status.structuredContent.address, '42 Maple Street, Apt 3B, Seattle, WA 98109');

  const over = await call('emergency_step', { action: 'resolved' });
  assert.equal(over.structuredContent.resolved, true);
  await settle();
  assert.equal(sent.at(-1).title, 'Emergency over');
  assert.equal((await call('emergency_status')).structuredContent.active, false);
  // The parent's header no longer says "Emergency reported".
  const after = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  assert.equal(after.emergency, null);
  assert.equal((await call('emergency_step', { action: 'done' })).isError, true);
  assert.equal((await post('/parent/api/incident', { action: 'on_the_way', minutes: 5 })).status, 409);
});
