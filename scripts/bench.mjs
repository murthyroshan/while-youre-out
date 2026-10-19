// Speed, load and fuzz numbers for the add-on, measured the way an Alexa+ host talks to it: MCP over
// Streamable HTTP, a fresh demo house per session, full round trips (request out, answer back).
//   1. Every tool: a scripted evening, repeated, timed per call. Amazon's MCP Toolkit asks for 500 ms.
//   2. Load: many sessions at once, each calling the everyday tools in a loop.
//   3. Fuzz: malformed and hostile requests. None may crash the server or come back as a 5xx.
// Usage: node scripts/bench.mjs [server URL] [--runs 20] [--sessions 50] [--load 2000] [--fuzz 1500] [--out file.md]
// e.g. (server started with WYO_DEMO=1) node scripts/bench.mjs http://127.0.0.1:8787 --out server/eval/SPEED.md
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const sdk = (p) => import(pathToFileURL(require.resolve(`@modelcontextprotocol/sdk/${p}`)).href);
const { Client } = await sdk('client/index.js');
const { StreamableHTTPClientTransport } = await sdk('client/streamableHttp.js');

const argv = process.argv.slice(2);
const opt = (name, d) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : d);
const base = (argv[0] && !argv[0].startsWith('--') ? argv[0] : 'http://127.0.0.1:8787').replace(/\/$/, '');
const RUNS = Number(opt('runs', 20));
const SESSIONS = Number(opt('sessions', 50));
const LOAD = Number(opt('load', 2000));
const FUZZ = Number(opt('fuzz', 1500));
const OUT = opt('out', null);
const BUDGET = 500;

const q = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const ms = (x) => (Number.isFinite(x) ? `${Math.round(x)} ms` : 'n/a');

// The demo server makes at most 30 new houses a minute (40 at once), so the runs share a few.
const HOUSES = Array.from({ length: 8 }, () => randomBytes(16).toString('hex'));
async function openHouse(id = HOUSES[0]) {
  const house = `${base}/h/${id}`;
  const client = new Client({ name: 'bench', version: '1.0' });
  const t = performance.now();
  await client.connect(new StreamableHTTPClientTransport(new URL(`${house}/mcp`)));
  const connectMs = performance.now() - t;
  const post = (path, body) => fetch(`${house}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  return { house, client, connectMs, post };
}

// ---------- 1. every tool ----------
const times = new Map();
const connects = [];
const errors = [];
async function evening(i) {
  const { house, client, connectMs, post } = await openHouse(HOUSES[i % 4]);
  connects.push(connectMs);
  const key = new URL((await (await fetch(`${house}/demo/config`)).json()).parent_url, base).searchParams.get('k');
  const call = async (name, args = {}) => {
    const t = performance.now();
    const r = await client.callTool({ name, arguments: args });
    const d = performance.now() - t;
    if (r.isError) errors.push(`${name}: ${r.content?.[0]?.text}`);
    times.set(name, [...(times.get(name) ?? []), d]);
    return r;
  };
  await post('/demo/clock', { time: '18:00', day: 'Sat' });
  await call('home_screen');
  await call('start_handoff', { carer_name: 'Priya', language: 'en' });
  await call('teachback');
  await call('teachback', { answer: 'Peanuts' });
  await call('teachback', { answer: 'In the drawer by the stove' });
  await call('teachback', { answer: 'Anita' });
  await call('tonight_plan');
  await call('ask_house', { question: 'Can Maya have the cookies on the counter?' });
  await call('ask_house', { question: 'What should the kids eat for dinner?' });
  await call('where_is', { item: 'EpiPen' });
  await post('/demo/clock', { time: '18:20', day: 'Sat' });
  await call('order_dinner');
  const o = await call('request_order', { item: 'the mac and cheese' });
  await post('/parent/api/order', { k: key, id: o.structuredContent?.id, action: 'approve', by: 'Anita' });
  await call('order_status', { id: o.structuredContent?.id });
  const a = await call('ask_parent', { question: 'Can she stay up until 9 to finish her movie?' });
  await post('/parent/api/answer', { k: key, id: a.structuredContent?.id, answer: 'Yes, just tonight.', by: 'Anita' });
  await call('check_parent_answer', { question_id: a.structuredContent?.id });
  await call('log_event', { text: 'Maya ate all her dinner' });
  await call('home_screen');
  await post('/demo/clock', { time: '20:10', day: 'Sat' });
  await post('/demo/ring', { who: 'stranger' });
  await call('door_check', { question: 'Someone is knocking, should I open the door?' });
  await call('emergency', { description: 'Maya ate a cookie and her lips are swelling' });
  await call('emergency_step', { action: 'done' });
  await call('emergency_status');
  await call('emergency_step', { action: 'resolved' });
  await post('/demo/clock', { time: '20:40', day: 'Sat' });
  await call('log_event', { text: 'Maya is asleep' });
  await call('play_message');
  await post('/demo/clock', { time: '23:00', day: 'Sat' });
  await call('end_handoff');
  await call('pay_sitter');
  await client.close();
}

console.log(`1/3 every tool: ${RUNS} evenings against ${base}`);
for (let i = 0; i < RUNS; i++) await evening(i);

// ---------- 2. load ----------
console.log(`2/3 load: ${LOAD} calls from ${SESSIONS} sessions at once`);
const loadTimes = [];
let loadErrors = 0;
const MIX = [
  ['ask_house', { question: 'Can Maya have a cookie?' }],
  ['ask_house', { question: 'What time is bedtime?' }],
  ['home_screen', {}],
  ['where_is', { item: 'EpiPen' }],
  ['tonight_plan', {}],
  ['door_check', { question: 'Should I open the door?' }],
  ['log_event', { text: 'Maya is reading' }],
];
let issued = 0;
const loadStart = performance.now();
for (const id of HOUSES) {
  const { client } = await openHouse(id);
  await client.callTool({ name: 'start_handoff', arguments: { carer_name: 'Priya', language: 'en', replace: true } });
  await client.close();
}
await Promise.all(
  Array.from({ length: SESSIONS }, async (_, i) => {
    const { client } = await openHouse(HOUSES[i % HOUSES.length]);
    while (issued < LOAD) {
      const [name, args] = MIX[issued++ % MIX.length];
      const t = performance.now();
      try {
        const r = await client.callTool({ name, arguments: args });
        if (r.isError) loadErrors++;
      } catch {
        loadErrors++;
      }
      loadTimes.push(performance.now() - t);
    }
    await client.close();
  }),
);
const loadSeconds = (performance.now() - loadStart) / 1000;

// ---------- 3. fuzz ----------
console.log(`3/3 fuzz: ${FUZZ} malformed or hostile requests`);
const fuzzHouse = `${base}/h/${HOUSES[7]}`;
const statuses = new Map();
let session = '';
const raw = async (body, headers = {}) => {
  const r = await fetch(`${fuzzHouse}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(session ? { 'mcp-session-id': session, 'mcp-protocol-version': '2025-11-25' } : {}), ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  session ||= r.headers.get('mcp-session-id') ?? '';
  await r.text();
  return r.status;
};
await raw({ jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fuzz', version: '1' } } });
await raw({ jsonrpc: '2.0', method: 'notifications/initialized' });
const TOOLS = ['ask_house', 'where_is', 'log_event', 'start_handoff', 'teachback', 'door_check', 'emergency', 'emergency_step', 'request_order', 'order_status', 'check_parent_answer', 'pay_sitter', 'set_carer_language', 'nonexistent_tool', '__proto__', ''];
const NASTY = [
  null, true, -1, 1e308, NaN, '', ' ', 'x'.repeat(200_000), '\u0000\u0001\u0002', '<script>alert(1)</script>', "'; DROP TABLE facts; --", '{{7*7}}', '${process.env}',
  '../../etc/passwd', '‮evil', '😀'.repeat(5000), 'माया को मूंगफली', [], [1, 2, 3], {}, { __proto__: { admin: true } }, { constructor: { prototype: { x: 1 } } }, { a: { b: { c: { d: { e: {} } } } } },
];
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];
const argsFor = () => {
  const keys = ['question', 'item', 'text', 'carer_name', 'answer', 'description', 'action', 'id', 'question_id', 'language', 'kind', 'hourly_rate', 'replace', 'skip', '__proto__', 'constructor'];
  const o = {};
  for (let i = 0; i < 1 + Math.floor(Math.random() * 4); i++) o[pick(keys)] = pick(NASTY);
  return o;
};
const SHAPES = [
  () => ({ jsonrpc: '2.0', id: issued++, method: 'tools/call', params: { name: pick(TOOLS), arguments: argsFor() } }),
  () => ({ jsonrpc: '2.0', id: issued++, method: 'tools/call', params: { name: pick(TOOLS), arguments: pick(NASTY) } }),
  () => ({ jsonrpc: '2.0', id: issued++, method: 'tools/call', params: pick(NASTY) }),
  () => ({ jsonrpc: '2.0', id: issued++, method: pick(['tools/list', 'resources/read', 'resources/subscribe', 'prompts/get', 'tasks/get', 'nope', '', 'initialize']), params: pick([{}, { uri: pick(NASTY) }, { uri: 'ui://../../secret' }, { uri: 'house://tonight' }, null]) }),
  () => ({ jsonrpc: pick(['1.0', null, 2]), id: pick([null, {}, [], 'x']), method: 'tools/call' }),
  () => [{ jsonrpc: '2.0', id: issued++, method: 'tools/list' }, { jsonrpc: '2.0', id: issued++, method: 'tools/call', params: { name: 'ask_house', arguments: { question: 'hi' } } }],
  () => '{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {',
  () => pick(['', 'null', '[]', '"a string"', '\u0000', 'x'.repeat(5_000_000)]),
];
for (let i = 0; i < FUZZ; i++) {
  let status;
  try {
    status = await raw(pick(SHAPES)(), Math.random() < 0.05 ? { 'content-type': pick(['text/plain', 'application/xml', '']) } : {});
  } catch (e) {
    status = `network error: ${e.message}`;
  }
  statuses.set(status, (statuses.get(status) ?? 0) + 1);
}
// After all that, the server still answers a normal question correctly.
const { client: after } = await openHouse();
const still = await after.callTool({ name: 'ask_house', arguments: { question: 'Where is the EpiPen?' } });
const healthy = /stove/i.test(still.content?.[0]?.text ?? '');
await after.close();
const fiveXX = [...statuses].filter(([s]) => typeof s !== 'number' || s >= 500).reduce((n, [, c]) => n + c, 0);

// ---------- report ----------
const all = [...times.values()].flat();
const rows = [...times]
  .map(([name, xs]) => ({ name, n: xs.length, p50: q(xs, 0.5), p95: q(xs, 0.95), max: Math.max(...xs) }))
  .sort((a, b) => b.p95 - a.p95);
const over = rows.filter((r) => r.p95 > BUDGET);
const machine = `${cpus()[0]?.model.trim() ?? 'unknown CPU'}, ${cpus().length} threads, ${Math.round(totalmem() / 2 ** 30)} GB, Node ${process.version}, ${process.platform}`;
const md = `# Speed, load and fuzz

Measured ${new Date().toISOString().slice(0, 10)} with \`node scripts/bench.mjs${base.includes('127.0.0.1') || base.includes('localhost') ? '' : ` ${base}`}\` against ${base.includes('127.0.0.1') || base.includes('localhost') ? 'a local server' : base} (${machine}). Every number is a full MCP round trip over Streamable HTTP, the way an Alexa+ host calls the add-on: request out, answer back. Amazon's MCP Toolkit budget is ${BUDGET} ms per tool call.

## Every tool (${RUNS} scripted evenings)

**${all.length} calls: p50 ${ms(q(all, 0.5))}, p95 ${ms(q(all, 0.95))}, slowest ${ms(Math.max(...all))}. ${over.length ? `${over.length} tools over ${BUDGET} ms at p95: ${over.map((r) => r.name).join(', ')}.` : `Every tool under ${BUDGET} ms at p95.`}** Connecting (MCP initialize) p50 ${ms(q(connects, 0.5))}, p95 ${ms(q(connects, 0.95))}.${errors.length ? ` Tool errors: ${errors.length} (${[...new Set(errors)].slice(0, 3).join('; ')}).` : ' No tool errors.'}

| Tool | Calls | p50 | p95 | Slowest |
|---|---|---|---|---|
${rows.map((r) => `| \`${r.name}\` | ${r.n} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.max)} |`).join('\n')}

Not timed here: \`import_note\` (it reads a parent's note with Gemini, so it's Google's speed, not ours) and \`ask_parent_and_wait\` (it waits for a person by design).

## Load

${loadTimes.length} calls from ${SESSIONS} MCP sessions at once, spread over ${HOUSES.length} houses (a mix of asking, the home screen, the plan, the door and the log): **${Math.round(loadTimes.length / loadSeconds)} calls a second, p50 ${ms(q(loadTimes, 0.5))}, p95 ${ms(q(loadTimes, 0.95))}, p99 ${ms(q(loadTimes, 0.99))}, ${loadErrors} errors.**

## Fuzz

${FUZZ} malformed or hostile requests to one session: broken JSON, wrong JSON-RPC, unknown tools and methods, wrong types, 200 KB and 5 MB strings, control characters, script and SQL text, \`__proto__\` keys, deep nesting, batches, wrong content types. **${fiveXX} server errors (5xx) or dropped connections.** (The demo server also limits new houses to 30 a minute, so a script can't fill it for everyone; that limit is why these runs share ${HOUSES.length} houses.) Responses by status: ${[...statuses].sort().map(([s, c]) => `${s} × ${c}`).join(', ')}. Afterwards the server still answered "Where is the EpiPen?" correctly: **${healthy ? 'yes' : 'NO'}**.
`;
console.log(`\n${md}`);
if (OUT) writeFileSync(OUT, md);
process.exit(fiveXX || !healthy ? 1 : 0);
