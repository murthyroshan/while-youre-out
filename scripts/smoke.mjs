// Checks the live demo the way a judge uses it: the page loads, a fresh house connects over MCP,
// the add-on answers from the house manual, and the parent page answers for that house.
// Usage: node scripts/smoke.mjs https://while-youre-out-wpj3.onrender.com
import { randomBytes } from 'node:crypto';

const base = (process.argv[2] ?? process.env.DEMO_URL ?? '').replace(/\/$/, '');
if (!base) throw new Error('Give the demo URL: node scripts/smoke.mjs https://...');
const house = `${base}/h/${randomBytes(16).toString('hex')}`;
const failures = [];
const check = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    console.log(`ok   ${name} (${Date.now() - t} ms)`);
  } catch (e) {
    failures.push(name);
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
};
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
// A free host may be asleep: the first request can take a minute.
const get = (path, opts = {}) => fetch(path.startsWith('http') ? path : `${base}${path}`, { signal: AbortSignal.timeout(90_000), ...opts });

let session = '';
let id = 0;
const rpc = async (method, params, notify = false) => {
  const r = await get(`${house}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': '2025-06-18' } : {}),
    },
    body: JSON.stringify(notify ? { jsonrpc: '2.0', method, params } : { jsonrpc: '2.0', id: ++id, method, params }),
  });
  session ||= r.headers.get('mcp-session-id') ?? '';
  const body = await r.text();
  if (notify) return null;
  expect(r.ok, `${method}: HTTP ${r.status}`);
  // The reply is JSON, or a server-sent event whose data is JSON.
  const json = body.trim().startsWith('{') ? body : body.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).pop();
  const msg = JSON.parse(json ?? '{}');
  expect(!msg.error, `${method}: ${msg.error?.message}`);
  return msg.result;
};

await check('health', async () => {
  const r = await get('/health');
  expect(r.ok, `HTTP ${r.status}`);
});
await check('version', async () => {
  const v = await (await get('/version')).json();
  expect(typeof v.commit === 'string' && v.commit.length >= 7, 'no commit');
  console.log(`     live commit ${v.commit.slice(0, 7)}, up since ${v.started_at}`);
});
await check('simulator page', async () => {
  const html = await (await get('/')).text();
  expect(/Echo Show Simulator/.test(html), 'the page is not the simulator');
});
await check('MCP: connect a fresh house', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } });
  expect(init?.serverInfo?.name === 'while-youre-out', 'unexpected server');
  await rpc('notifications/initialized', undefined, true);
  const tools = (await rpc('tools/list', {})).tools.map((t) => t.name);
  for (const t of ['start_handoff', 'ask_house', 'emergency', 'door_check', 'pay_sitter']) expect(tools.includes(t), `missing tool ${t}`);
});
await check('MCP: the house manual answers', async () => {
  const r = await rpc('tools/call', { name: 'ask_house', arguments: { question: 'Where is the EpiPen?' } });
  const text = r.content.map((c) => c.text ?? '').join(' ');
  expect(/drawer/i.test(text), `unexpected answer: ${text.slice(0, 120)}`);
});
await check('MCP: an emergency gets the fixed script', async () => {
  const r = await rpc('tools/call', { name: 'emergency', arguments: { description: "Her lips are swelling and she can't breathe" } });
  const text = r.content.map((c) => c.text ?? '').join(' ');
  expect(/911/.test(text), `no 911 in: ${text.slice(0, 120)}`);
});
await check('parent page for that house', async () => {
  const cfg = await (await get(`${house}/demo/config`)).json();
  const s = await (await get(`${house}${cfg.parent_url.replace('/parent?', '/parent/api/state?')}`)).json();
  expect(s.incident || s.emergency, 'the parent page does not see the emergency');
});

console.log(failures.length ? `\n${failures.length} check(s) failed: ${failures.join(', ')}` : '\nAll checks passed.');
process.exit(failures.length ? 1 : 0);
