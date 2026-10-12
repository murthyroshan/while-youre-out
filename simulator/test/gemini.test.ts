// The Gemini brain with a scripted fake model: tool routing, what gets spoken, tasks, safety, fallback.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiBrain } from '../src/brain/gemini';
import type { Brain, DeviceIO } from '../src/brain/types';
import type { ToolResult } from '../src/mcp';

type Call = { name: string; args: Record<string, unknown> };

const TOOLS = ['start_handoff', 'teachback', 'ask_house', 'ask_parent', 'ask_parent_and_wait', 'emergency', 'log_event', 'set_carer_language'].map((name) => ({
  name,
  description: name,
  inputSchema: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: {} },
}));

function setup(script: Array<Array<Record<string, unknown>> | 'fail'>, toolReplies: Record<string, Partial<ToolResult>> = {}) {
  const requests: any[] = [];
  let i = 0;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const next = script[i++];
    if (next === 'fail' || next === undefined) return new Response(JSON.stringify({ error: 'quota' }), { status: 503 });
    return new Response(JSON.stringify({ parts: next, model: 'fake' }), { status: 200 });
  }) as typeof fetch;
  const calls: Call[] = [];
  const said: string[] = [];
  const tasks: Call[] = [];
  const io: DeviceIO = {
    say: (t) => void said.push(t),
    tool: async (name, args = {}) => {
      calls.push({ name, args });
      return { content: [{ type: 'text', text: `${name} says hi` }], structuredContent: {}, ...toolReplies[name] } as ToolResult;
    },
    task: (name, args) => void tasks.push({ name, args }),
  };
  const fallbackCalls: string[] = [];
  const fallback: Brain = { name: 'rules', handle: async (u) => void fallbackCalls.push(u) };
  const brain = new GeminiBrain({ serverOrigin: 'http://server', tools: () => TOOLS as any, instructions: () => 'Server says: be careful.', fallback, fetchImpl });
  return { brain, io, calls, said, tasks, requests, fallbackCalls };
}

const fc = (name: string, args: Record<string, unknown> = {}, id?: string) => ({ functionCall: { name, args, ...(id ? { id } : {}) } });

test('routes a question to ask_house and speaks the server\'s own words, not the model\'s', async () => {
  const s = setup([[fc('ask_house', { question: 'Can Maya have the cookies?' }, 'c1')], [{ text: 'Sure, cookies are great!' }]]);
  await s.brain.handle('Can Maya have the cookies?', s.io);
  assert.deepEqual(s.calls, [{ name: 'ask_house', args: { question: 'Can Maya have the cookies?' } }]);
  assert.deepEqual(s.said, ['ask_house says hi'], 'the model\'s paraphrase is never spoken over a tool answer');
  // The function response went back to the model with the same id.
  const last = s.requests[1].contents.at(-1);
  assert.equal(last.parts[0].functionResponse.name, 'ask_house');
  assert.equal(last.parts[0].functionResponse.id, 'c1');
});

test('the model gets the tools (without $schema and without the non-task ask_parent) and the server instructions', async () => {
  const s = setup([[{ text: 'Hello!' }]]);
  await s.brain.handle('hi there', s.io);
  const req = s.requests[0];
  const names = req.functions.map((f: any) => f.name);
  assert.ok(names.includes('ask_parent_and_wait'));
  assert.ok(!names.includes('ask_parent'));
  assert.ok(!JSON.stringify(req.functions).includes('$schema'));
  assert.match(req.system, /Server says: be careful/);
  assert.deepEqual(s.said, ['Hello!'], 'small talk uses the model\'s reply');
});

test('a multi-step turn: start the handoff, then the teach-back', async () => {
  const s = setup([[fc('start_handoff', { carer_name: 'Dadi', language: 'hi-IN' })], [fc('teachback', {})], [{ text: '' }]], {
    teachback: { content: [{ type: 'text', text: 'Maya ko kis cheez se allergy hai?' }] },
  });
  await s.brain.handle('Dadi is babysitting tonight, she speaks Hindi', s.io);
  assert.deepEqual(
    s.calls.map((c) => c.name),
    ['start_handoff', 'teachback'],
  );
  assert.equal(s.said.length, 1);
  assert.match(s.said[0], /start_handoff says hi Maya ko kis cheez/);
});

test('asking a parent runs as a background task', async () => {
  const s = setup([[fc('ask_parent_and_wait', { question: 'Can she sleep in your bed?' })], [{ text: 'Asked.' }]]);
  await s.brain.handle('yes please ask her mom', s.io);
  assert.deepEqual(s.tasks, [{ name: 'ask_parent_and_wait', args: { question: 'Can she sleep in your bed?' } }]);
  assert.match(s.said[0], /asking now/);
});

test('emergencies never wait for the model', async () => {
  const s = setup([]);
  await s.brain.handle("She can't breathe!", s.io);
  assert.equal(s.requests.length, 0, 'no model call');
  assert.deepEqual(s.calls, [{ name: 'emergency', args: { description: "She can't breathe!" } }]);
});

test('if a tool reports an emergency (e.g. said in Tamil), the emergency script runs', async () => {
  const tamil = 'அவளால் மூச்சு விட முடியவில்லை';
  const s = setup([[fc('ask_house', { question: tamil, question_english: "She can't breathe" })], [{ text: '' }]], {
    ask_house: { structuredContent: { emergency: true } },
    emergency: { content: [{ type: 'text', text: 'Call 911 now' }] },
  });
  await s.brain.handle(tamil, s.io);
  assert.deepEqual(
    s.calls.map((c) => c.name),
    ['ask_house', 'emergency'],
  );
  assert.deepEqual(s.calls[1].args, { description: tamil, description_english: "She can't breathe" });
  assert.match(s.said[0], /911/);
});

test('common Hindi and Spanish emergencies skip the model entirely', async () => {
  for (const u of ['वह सांस नहीं ले पा रही है!', 'No puede respirar']) {
    const s = setup([]);
    await s.brain.handle(u, s.io);
    assert.equal(s.requests.length, 0, u);
    assert.equal(s.calls[0].name, 'emergency');
  }
});

test('when the model is unavailable, the rule brain answers that turn', async () => {
  const s = setup(['fail']);
  await s.brain.handle('What time is bedtime?', s.io);
  assert.deepEqual(s.fallbackCalls, ['What time is bedtime?']);
  assert.equal(s.said.length, 0);
});

test('a runaway model is stopped after a few rounds', async () => {
  const loop = Array.from({ length: 10 }, () => [fc('ask_house', { question: 'again' })]);
  const s = setup(loop);
  await s.brain.handle('loop please', s.io);
  assert.ok(s.requests.length <= 5);
});
