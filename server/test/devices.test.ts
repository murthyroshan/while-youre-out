// The whole house: each device follows the parents' own rules and what happens tonight. The TV
// keeps the screen-time limit and pauses for bath; lights out reaches the child's room; in an
// emergency the porch light comes on and a parent can unlock the door, and the sitter is told
// straight away; what a parent tells their Bee moves the plan; a subscribed host hears it live.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';

const KEY = 'devices-test-key';
const TZ = 'America/Los_Angeles';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
const updated: string[] = [];
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const said = (r: any) => r.content.find((c: any) => c.type === 'text')?.text ?? '';
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });
const house = async () => (await fetch(`${base}/demo/devices`)).json();
const settle = () => new Promise((r) => setTimeout(r, 40));

before(async () => {
  const created = createApp({ parentKey: KEY, demo: true, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'devices-test', version: '0' });
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => void updated.push(n.params.uri));
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  resetClock();
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test("the TV keeps the parents' screen-time limit: it starts when the kids watch and pauses at the limit", async () => {
  setDemoTime('17:30', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  const r = await call('log_event', { text: 'Maya is watching cartoons' });
  assert.match(said(r), /Anita's limit is 1 hour of TV, so I'll pause it at 6:30 pm\./);
  assert.equal((await house()).tv.status, 'playing');
  setDemoTime('18:29', TZ, 'Sat');
  await call('ask_house', { question: 'Where are the pyjamas?' });
  assert.equal((await house()).tv.status, 'playing', 'not yet');
  setDemoTime('18:31', TZ, 'Sat');
  const next = await call('ask_house', { question: 'Can she have a snack?' });
  assert.match(said(next), /^I've paused the TV: that's 1 hour, the parents' limit for tonight\./, 'the sitter hears it first, on her next reply');
  const tv = (await house()).tv;
  assert.equal(tv.status, 'paused');
  assert.equal(tv.banner, "That's 1 hour of TV · from Anita");
  await call('end_handoff');
});

test('bath time pauses the TV, with a message from Mom on the screen', async () => {
  setDemoTime('18:50', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  await call('log_event', { text: 'She started watching a show' });
  setDemoTime('19:15', TZ, 'Sat');
  const r = await call('ask_house', { question: 'Where are the towels?' });
  assert.match(said(r), /I've paused the TV in the living room: bath time\./);
  assert.equal((await house()).tv.banner, 'Bath time · from Anita');
  await call('end_handoff');
});

test("lights out reaches the child's room: the night light, and the goodnight message plays there", async () => {
  setDemoTime('19:58', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  await call('tonight_plan', { announce: true });
  const d = await house();
  assert.equal(d.dot.room, "Maya's room");
  assert.equal(d.dot.night_light, true);
  assert.match(d.dot.playing, /goodnight message|White noise/);
  assert.equal(d.door.locked, true);
  await call('end_handoff');
});

test('an emergency: the porch light comes on; a parent unlocks the door and the guide tells the sitter at once', async () => {
  setDemoTime('19:30', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  await call('emergency', { description: "She can't breathe" });
  assert.equal((await house()).door.porch_light, true);
  const r = await post('/parent/api/door', { action: 'unlock', by: 'Anita' });
  assert.equal(r.status, 200);
  assert.equal((await house()).door.locked, false);
  const heard = await call('emergency_status', { announce: true });
  assert.ok(heard.structuredContent.announce.includes('Anita unlocked the front door for the paramedics.'));
  assert.ok(heard.structuredContent.incident.updates.some((u: any) => u.text === 'Unlocked the front door for the paramedics' && u.by === 'Anita'));
  const state = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  assert.ok(state.audit.some((a: any) => a.action === 'Unlocked the front door' && a.via === "Anita's phone"));
  assert.equal((await post('/parent/api/door', { action: 'open sesame' })).status, 400);
  await call('emergency_step', { action: 'resolved' });
  await call('end_handoff');
});

test("what a parent tells their Bee moves tonight's plan, and the sitter hears it", async () => {
  setDemoTime('17:00', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  const r = await (await post('/demo/bee', { text: 'Maya napped until 4:30 today', by: 'Anita' })).json();
  assert.match(r.plan_change, /So bedtime is now 8:30 pm\./);
  const next = await call('ask_house', { question: 'Where are the crayons?' });
  assert.match(said(next), /^Anita told her Bee: "Maya napped until 4:30 today"\. Bedtime is now 8:30 pm\. /, 'just the news; the card shows the rule');
  assert.equal((await house()).bee.note, 'Maya napped until 4:30 today');
  await call('end_handoff');
});

test('a host that subscribes to house://tonight is told the moment it changes', async () => {
  setDemoTime('17:00', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  await client.subscribeResource({ uri: 'house://tonight' });
  updated.splice(0);
  await post('/demo/bee', { text: 'She napped till 4:45', by: 'Anita' });
  await settle();
  assert.ok(updated.includes('house://tonight'), 'the plan changed: the host is told');
  const now = JSON.parse(((await client.readResource({ uri: 'house://tonight' })).contents[0] as any).text);
  assert.equal(now.plan.shift, 30);
  assert.equal(now.carer, 'Priya');
  await client.unsubscribeResource({ uri: 'house://tonight' });
  await call('end_handoff');
});
