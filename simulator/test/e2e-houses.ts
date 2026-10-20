// Not a unit test (no .test.ts): plays the guided demo against a RUNNING server in two houses at
// once, the way two judges would, and checks they never see each other's evening.
//   npx tsx test/e2e-houses.ts http://127.0.0.1:8787
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { RuleBrain } from '../src/brain/rules';
import { GUIDE } from '../src/guide';
import type { DeviceIO } from '../src/brain/types';
import type { ToolResult } from '../src/mcp';

const server = process.argv[2] ?? 'http://127.0.0.1:8787';

async function house() {
  const id = randomBytes(16).toString('hex');
  const base = `${server}/h/${id}`;
  const client = new Client({ name: 'e2e', version: '0' }, { capabilities: { elicitation: { form: {}, url: {} } } });
  client.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'accept' }));
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  const said: string[] = [];
  const io: DeviceIO = {
    say: (t) => void said.push(t),
    tool: async (name, args = {}) => (await client.callTool({ name, arguments: args })) as ToolResult,
    task: () => {},
  };
  const post = (path: string, body: unknown = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  // each demo house has its own parent key
  const key = new URL((await (await fetch(`${base}/demo/config`)).json()).parent_url, server).searchParams.get('k') ?? '';
  const state = async () => (await fetch(`${base}/parent/api/state?k=${encodeURIComponent(key)}`)).json();
  return { id, base, client, said, io, post, state, key };
}

const t0 = Date.now();
const a = await house();
const b = await house();

// Judge A plays the whole tour; judge B only starts a handoff with someone else, at the same time.
const brainA = new RuleBrain();
const brainB = new RuleBrain();
await a.post('/demo/reset');
await b.post('/demo/reset');
await brainB.handle('Dadi is babysitting tonight', b.io);
for (const step of GUIDE) {
  if (step.clock) await a.post('/demo/clock', { time: step.clock[1], day: step.clock[0] });
  for (const act of step.actions) {
    // the tour's actions, done the way the simulator does them
    if ('paste' in act) {
      const out = await (await a.post('/parent/api/import/text', { k: a.key, text: act.paste, label: 'WhatsApp message', by: 'Anita' })).json();
      for (const p of out.proposals.filter((x: { import_id: number }) => x.import_id === out.import_id)) await a.post(`/parent/api/proposals/${p.id}`, { k: a.key, action: 'accept', resolution: 'keep_both', by: 'Anita' });
    } else if ('ring' in act) await a.post('/demo/ring', { who: act.ring });
    else if ('bee' in act) await a.post('/demo/bee', { text: act.bee });
    else if ('door' in act) await a.post('/parent/api/door', { k: a.key, action: 'unlock', by: 'Anita' });
    else if ('approve' in act) {
      const s = await a.state();
      if (s.order?.id && s.order.status === 'pending') await a.post('/parent/api/order', { k: a.key, id: s.order.id, action: 'approve', by: 'Anita' });
    } else await brainA.handle(act.say, a.io);
  }
}

const sa = await a.state();
const sb = await b.state();
assert.equal(sb.handoff?.carer_name, 'Dadi', "B's handoff is still B's");
assert.equal(sb.emergency, null, "A's emergency never reached B");
assert.ok(!JSON.stringify(sb).includes('Priya babysat') && sb.debrief?.carer !== 'Priya', "A's evening is not in B's debrief");
assert.equal(sa.handoff, null, "A's tour ended its handoff");
assert.equal(sa.debrief?.carer, 'Priya');
const clockA = (await (await fetch(`${a.base}/demo/clock`)).json()).hhmm;
const clockB = (await (await fetch(`${b.base}/demo/clock`)).json()).hhmm;
assert.notEqual(clockA, clockB, 'separate clocks');
assert.ok(a.said.some((s) => /Priya's evening comes to \$80/.test(s)), 'A got to "Pay Priya"');
assert.ok(!a.said.some((s) => /went wrong|does not support/i.test(s)), a.said.find((s) => /went wrong|does not support/i.test(s)));

// The parent page, opened through A's house link, finds A's house by cookie.
const page = await fetch(`${a.base}/parent?k=${encodeURIComponent(a.key)}`);
const cookie = (page.headers.get('set-cookie') ?? '').split(';')[0];
const viaCookie = await (await fetch(`${server}/parent/api/state?k=${encodeURIComponent(a.key)}`, { headers: { cookie } })).json();
assert.equal(viaCookie.debrief?.carer, 'Priya');

await a.client.close();
await b.client.close();
console.log(`OK in ${Date.now() - t0} ms: ${a.said.length} replies in house A, house B untouched, cookie routing works.`);
