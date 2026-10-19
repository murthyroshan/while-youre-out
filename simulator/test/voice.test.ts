// Echo Show replies are heard, not read: the whole guided demo, as a judge clicks through it, with
// the simulator's rule brain and the real server. Every spoken reply stays short; details go on screen.
// The one exception is the fixed emergency script, which is always read in full.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ElicitRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { createApp } from '../../server/src/index';
import { SPOKEN_WORDS } from '../../server/src/domain/safety';
import { RuleBrain } from '../src/brain/rules';
import { GUIDE } from '../src/guide';
import type { DeviceIO } from '../src/brain/types';
import type { ToolResult } from '../src/mcp';


let http: Server;
let close: () => void;
let base: string;
let client: Client;

before(async () => {
  const created = createApp({ parentKey: 'voice-key', demo: true, escalateAfterMs: 60_000 });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  // Like the Echo Show: it can ask on screen and open a link on the parent's phone (elicitation).
  client = new Client({ name: 'voice-test', version: '0.0.0' }, { capabilities: { elicitation: { form: {}, url: {} } } });
  client.setRequestHandler(ElicitRequestSchema, async () => ({ action: 'accept' }));
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

test(`every reply in the guided demo is ${SPOKEN_WORDS} words or fewer`, async () => {
  const brain = new RuleBrain();
  const replies: Array<{ said: string; reply: string; tool: string }> = [];
  let said = '';
  let tool = '';
  const io: DeviceIO = {
    say: (t) => void replies.push({ said, reply: t, tool }),
    tool: async (name, args = {}) => {
      tool = name;
      return (await client.callTool({ name, arguments: args })) as ToolResult;
    },
    task: () => {}, // asking a parent waits for a human; its first words are said by the brain
  };
  for (const step of GUIDE) {
    if (step.clock) await post('/demo/clock', { time: step.clock[1], day: step.clock[0] });
    for (const a of step.actions) {
      if ('ring' in a) {
        await post('/demo/ring', { who: a.ring });
        continue;
      }
      // Mom's side: what she tells her Bee, and the door unlocked from her phone.
      if ('bee' in a) {
        await post('/demo/bee', { text: a.bee, by: 'Anita' });
        continue;
      }
      if ('door' in a) {
        await post('/parent/api/door', { k: 'voice-key', action: a.door, by: 'Anita' });
        continue;
      }
      said = a.say;
      tool = '';
      await brain.handle(a.say, io);
    }
  }
  const long = replies.filter((r) => r.tool !== 'emergency' && words(r.reply) > SPOKEN_WORDS);
  if (process.env.WYO_VOICE_REPORT) for (const r of replies) console.log(`${String(words(r.reply)).padStart(3)}  ${r.said}  →  ${r.reply}`);
  assert.deepEqual(long.map((r) => `${words(r.reply)} words after "${r.said}": ${r.reply}`), []);
  // Nothing failed along the way, and nothing is offered twice ("I can ask" then "Want me to ask?").
  assert.ok(!replies.some((r) => /does not support|went wrong/i.test(r.reply)), JSON.stringify(replies.at(-1)));
  for (let i = 1; i < replies.length; i++) {
    assert.ok(!(/I can ask/.test(replies[i - 1].reply) && /^Want me to ask/.test(replies[i].reply)), `asked twice after "${replies[i].said}"`);
  }
});
