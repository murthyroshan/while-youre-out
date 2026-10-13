// MCP elicitation: the add-on asks on screen who's babysitting (form mode), and sends the parent
// to their phone to approve paying the sitter (URL mode, with the completion notification).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitationCompleteNotificationSchema, ElicitRequestSchema, type ElicitResult } from '@modelcontextprotocol/sdk/types.js';
import { billableMinutes } from '../src/domain/payments.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { createApp } from '../src/index.js';
import type { PushSender } from '../src/domain/push.js';

const TZ = 'America/Los_Angeles';
const KEY = 'elicit-test-key';
let http: Server;
let base: string;
let close: () => void;
const sent: any[] = [];
const sender: PushSender = async (_s, payload) => (sent.push(JSON.parse(payload)), { statusCode: 201 });

// The "device": answers elicitations from a queue and records completion notifications.
let answers: Array<(params: any) => ElicitResult> = [];
const asked: any[] = [];
const completed: string[] = [];
let device: Client;
let plain: Client;

async function connect(withElicitation: boolean) {
  const c = new Client({ name: 'device', version: '0' }, withElicitation ? { capabilities: { elicitation: { form: {}, url: {} } } } : {});
  if (withElicitation) {
    c.setRequestHandler(ElicitRequestSchema, async (req) => {
      asked.push(req.params);
      return (answers.shift() ?? (() => ({ action: 'decline' as const })))(req.params);
    });
    c.setNotificationHandler(ElicitationCompleteNotificationSchema, (n) => void completed.push(n.params.elicitationId));
  }
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return c;
}
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => (await c.callTool({ name, arguments: args })) as any;

before(async () => {
  const created = createApp({ parentKey: KEY, pushSender: sender, ai: { available: false } as any });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  device = await connect(true);
  plain = await connect(false);
  await fetch(`${base}/parent/api/push/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ k: KEY, subscription: { endpoint: 'https://push.example.com/anita', keys: { p256dh: 'x'.repeat(87), auth: 'auth-secret-16b' } }, member: 'Anita' }),
  });
});

after(async () => {
  await device.close();
  await plain.close();
  close();
  http.closeAllConnections();
  http.close();
  resetClock();
});

test('billable time: rounded up to the quarter hour, at least an hour', () => {
  const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 17, h, m)).toISOString();
  assert.equal(billableMinutes({ started_at: at(1, 0), ended_at: at(5, 10) }), 255);
  assert.equal(billableMinutes({ started_at: at(1, 0), ended_at: at(1, 20) }), 60);
});

test('a host without elicitation is asked to say the name instead', async () => {
  const r = await call(plain, 'start_handoff', {});
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /Who's looking after the kids tonight/);
});

test('the parent cancels the form: nothing starts', async () => {
  answers = [() => ({ action: 'cancel' })];
  const r = await call(device, 'start_handoff', {});
  assert.equal(r.structuredContent.view, 'handoff_cancelled');
  assert.equal((await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json()).handoff, null);
});

test('"We\'re heading out" → a form on the Echo Show → sitter mode for the name typed, with their language and rate', async () => {
  setDemoTime('18:00', TZ, 'Sat');
  answers = [(p) => ({ action: 'accept', content: { carer_name: 'Priya', language: 'en', hourly_rate: 18 } })];
  const r = await call(device, 'start_handoff', {});
  const form = asked.at(-1);
  assert.equal(form.mode, 'form');
  assert.equal(form.message, "Who's looking after the kids tonight?");
  assert.deepEqual(form.requestedSchema.required, ['carer_name']);
  assert.ok(form.requestedSchema.properties.language.oneOf.some((o: any) => o.const === 'hi-IN' && o.title === 'Hindi'));
  assert.equal(r.structuredContent.view, 'briefing');
  assert.equal(r.structuredContent.carer, 'Priya');
});

test('"Pay Priya": URL elicitation to the phone, tip on the page, the device hears it\'s done', async () => {
  setDemoTime('22:10', TZ, 'Sat');
  await call(device, 'end_handoff');
  answers = [() => ({ action: 'accept' })];
  const r = await call(device, 'pay_sitter');
  const link = asked.at(-1);
  assert.equal(link.mode, 'url');
  assert.match(link.message, /^Approve paying Priya \$76\.50 for tonight \(4 h 15 min at \$18 an hour\) on your phone\.$/);
  assert.match(link.url, /\/pay\/[0-9a-f]{32}$/);
  assert.equal(r.structuredContent.view, 'pay');
  assert.equal(r.structuredContent.status, 'pending');
  assert.match(r.structuredContent.qr_svg, /^<svg/);

  const pagePath = new URL(link.url).pathname;
  const page = await (await fetch(`${base}${pagePath}`)).text();
  assert.match(page, /Pay Priya for tonight/);
  assert.match(page, /no money moves/);

  sent.splice(0);
  const paid = await (await fetch(`${base}${pagePath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pay', tip: 1000 }) })).json();
  assert.equal(paid.status, 'paid');
  await new Promise((res) => setTimeout(res, 100));
  assert.deepEqual(completed, [link.elicitationId], 'notifications/elicitation/complete reached the device');
  assert.equal(sent.at(-1).title, 'Paid Priya $86.50 ✓');

  const status = await call(device, 'payment_status', { id: r.structuredContent.id });
  assert.equal(status.content[0].text, 'Done. Priya has been paid $86.50.');
  assert.equal(status.structuredContent.tip, '$10');

  const again = await call(device, 'pay_sitter');
  assert.equal(again.isError, true);
  assert.match(again.content[0].text, /already been paid \$86\.50/);
  assert.equal((await fetch(`${base}${pagePath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'pay' }) })).status, 409);
  assert.equal((await fetch(`${base}/pay/${'0'.repeat(32)}`)).status, 404);
});
