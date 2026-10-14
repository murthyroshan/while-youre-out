// Goodnight messages: recorded on the parent's phone, played on the Echo Show at lights out or
// when the child misses the parents; the parents hear that it was played.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';
import type { PushSender } from '../src/domain/push.js';

const TZ = 'America/Los_Angeles';
const KEY = 'messages-test-key';
let http: Server;
let base: string;
let close: () => void;
let client: Client;
const sent: any[] = [];
const sender: PushSender = async (_s, payload) => (sent.push(JSON.parse(payload)), { statusCode: 201 });
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;
const state = async () => (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
const upload = (body: Buffer, type: string, query: string, k = KEY) =>
  fetch(`${base}/parent/api/messages?k=${k}&${query}`, { method: 'POST', headers: { 'content-type': type }, body: new Uint8Array(body) });

before(async () => {
  const created = createApp({ parentKey: KEY, pushSender: sender, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'messages-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  await fetch(`${base}/parent/api/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ k: KEY, subscription: { endpoint: 'https://push.example.com/anita', keys: { p256dh: 'x'.repeat(87), auth: 'auth-secret-16b' } }, member: 'Anita' }),
  });
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
  resetClock();
});

test('the demo family has a bedtime message; the media needs its own token, not the parent key', async () => {
  const s = await state();
  const m = s.messages[0];
  assert.deepEqual([m.from_name, m.for_name, m.when_to_play, m.kind], ['Anita', 'Maya', 'bedtime', 'audio']);
  assert.equal(m.token, undefined, 'the token only appears inside the media URL');
  const ok = await fetch(`${base}${m.url}`);
  assert.equal(ok.headers.get('content-type'), 'audio/wav');
  assert.equal((await fetch(`${base}/media/messages/${m.id}?t=wrong`)).status, 404);
  assert.equal((await fetch(`${base}/media/messages/${m.id}`)).status, 404);
});

test('a parent records a "missing you" video; bad uploads are refused', async () => {
  const video = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(500, 1)]);
  const r = await upload(video, 'video/webm;codecs=vp9,opus', 'by=Rahul&for=Maya&when=missing&caption=Daddy%20loves%20you');
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.deepEqual([body.message.kind, body.message.when_to_play, body.message.from_name, body.message.caption], ['video', 'missing', 'Rahul', 'Daddy loves you']);
  assert.equal((await upload(Buffer.from('<html>'), 'text/html', 'by=Rahul')).status, 400);
  assert.equal((await upload(Buffer.from('x'), 'image/png', 'by=Rahul')).status, 400);
  assert.equal((await upload(Buffer.from('x'), 'audio/x-unknown', 'by=Rahul')).status, 400);
  assert.equal((await upload(video, 'video/webm', 'by=Rahul', 'wrong')).status, 401);
});

test('"she misses her dad" plays the "missing you" message; it says who it is from', async () => {
  setDemoTime('19:40', TZ, 'Sat');
  await call('start_handoff', { carer_name: 'Priya' });
  sent.splice(0);
  const r = await call('play_message', { when: 'missing' });
  assert.equal(r.structuredContent.view, 'message');
  assert.deepEqual([r.structuredContent.from, r.structuredContent.relation, r.structuredContent.kind], ['Rahul', 'Dad', 'video']);
  assert.match(r.structuredContent.url, /^http.*\/media\/messages\/\d+\?t=[0-9a-f]{32}$/);
  assert.equal(r.content[0].text, 'Rahul left a message for Maya.');
  await new Promise((res) => setTimeout(res, 30));
  assert.equal(sent.at(-1).title, 'Maya heard your goodnight message 💛');
});

test('at lights out the bedtime reminder plays the bedtime message, once', async () => {
  setDemoTime('20:00', TZ, 'Sat');
  const r = await call('tonight_plan', { announce: true });
  assert.equal(r.structuredContent.view, 'message');
  assert.equal(r.structuredContent.from, 'Anita');
  assert.match(r.content[0].text, /lights out.*Anita left a goodnight message for Maya\. I've dimmed Maya's room and checked the front door is locked\.$/i);
  const again = await call('tonight_plan', { announce: true });
  assert.notEqual(again.structuredContent.view, 'message');
  const played = (await state()).messages.find((m: any) => m.from_name === 'Anita');
  assert.ok(played.played_at);
});

test('removing messages; with none left, play_message says so kindly', async () => {
  for (const m of (await state()).messages) {
    await fetch(`${base}/parent/api/messages/remove`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, id: m.id }) });
  }
  assert.equal((await state()).messages.length, 0);
  const r = await call('play_message', { when: 'missing' });
  assert.match(r.content[0].text, /haven't left a message tonight/);
});
