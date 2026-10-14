// Rules first, Gemini only when needed: what each one answers, and that they share the conversation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiBrain } from '../src/brain/gemini';
import { HybridBrain } from '../src/brain/hybrid';
import { RuleBrain } from '../src/brain/rules';
import type { DeviceIO } from '../src/brain/types';
import type { ToolResult } from '../src/mcp';

const TOOLS = ['start_handoff', 'teachback', 'ask_house', 'where_is', 'log_event', 'door_check', 'emergency'].map((name) => ({ name, description: name, inputSchema: { type: 'object', properties: {} } }));

function setup(model: 'ok' | 'down' = 'ok') {
  const requests: any[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    if (model === 'down') return new Response(JSON.stringify({ error: 'quota' }), { status: 503 });
    return new Response(JSON.stringify({ parts: [{ functionCall: { name: 'ask_house', args: { question: 'from the model' } } }] }), { status: 200 });
  }) as typeof fetch;
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const said: string[] = [];
  const io: DeviceIO = {
    say: (t) => void said.push(t),
    tool: async (name, args = {}) => {
      calls.push({ name, args });
      return { content: [{ type: 'text', text: `${name} ok` }], structuredContent: name === 'teachback' ? { kind: 'question' } : {} } as ToolResult;
    },
    task: () => {},
  };
  const rules = new RuleBrain();
  const gemini = new GeminiBrain({ serverOrigin: 'http://server', tools: () => TOOLS as any, instructions: () => undefined, fallback: rules, fetchImpl });
  return { brain: new HybridBrain(rules, gemini), requests, calls, said, io };
}

test('phrases the rules know never call the model', async () => {
  const s = setup();
  for (const u of ["Where's the EpiPen?", 'She napped till 5', "Someone's knocking, should I open the door?", "What's next?", 'Priya is babysitting tonight', 'Peanuts']) await s.brain.handle(u, s.io);
  assert.equal(s.requests.length, 0);
  assert.deepEqual(s.calls.map((c) => c.name), ['where_is', 'log_event', 'door_check', 'tonight_plan', 'start_handoff', 'teachback', 'teachback']);
});

test("a phrase the rules don't know goes to the model, which sees what the rules already said", async () => {
  const s = setup();
  await s.brain.handle("Where's the EpiPen?", s.io);
  await s.brain.handle('Tell her a story about a dragon who loves broccoli', s.io);
  assert.equal(s.requests.length, 1);
  const texts = JSON.stringify(s.requests[0].contents);
  assert.match(texts, /Where's the EpiPen\?/, 'the earlier turn is in the history');
  assert.match(texts, /where_is ok/, 'with what the device said');
  assert.equal(s.calls.at(-1)!.args.question, 'from the model');
});

test('another script (Hindi) goes to the model', async () => {
  const s = setup();
  await s.brain.handle('क्या माया कुकीज़ खा सकती है?', s.io);
  assert.equal(s.requests.length, 1);
});

test('emergencies are still caught before any model call, in any brain', async () => {
  const s = setup();
  await s.brain.handle("She can't breathe!", s.io);
  await s.brain.handle('वह सांस नहीं ले पा रही है!', s.io);
  assert.equal(s.requests.length, 0);
  assert.deepEqual(s.calls.map((c) => c.name), ['emergency', 'emergency']);
});

test('when the model is down, the rules answer with the house manual', async () => {
  const s = setup('down');
  await s.brain.handle('Tell her a story about a dragon', s.io);
  assert.equal(s.calls.at(-1)!.name, 'ask_house');
  assert.equal(s.calls.at(-1)!.args.question, 'Tell her a story about a dragon');
});

test('questions go straight to the house manual, never waiting on the model', async () => {
  const s = setup();
  await s.brain.handle('Can she have ice cream after dinner?', s.io);
  await s.brain.handle('Is it fine if she skips brushing her teeth tonight', s.io);
  assert.equal(s.requests.length, 0);
  assert.deepEqual(s.calls.map((c) => c.name), ['ask_house', 'ask_house']);
});
