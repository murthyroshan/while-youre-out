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

test('routes a question to ask_house and speaks the server\'s own words, in one model call', async () => {
  const s = setup([[fc('ask_house', { question: 'Can Maya have the cookies?' }, 'c1')], [{ text: 'Thanks!' }]]);
  await s.brain.handle('Can Maya have the cookies?', s.io);
  assert.deepEqual(s.calls, [{ name: 'ask_house', args: { question: 'Can Maya have the cookies?' } }]);
  assert.deepEqual(s.said, ['ask_house says hi']);
  assert.equal(s.requests.length, 1, 'once a tool has answered, the model is not asked again');
  // Next turn, the model sees the function response (same id) and what the device said.
  await s.brain.handle('thanks', s.io);
  const contents = s.requests[1].contents;
  const response = contents.find((c: any) => c.parts[0]?.functionResponse);
  assert.equal(response.parts[0].functionResponse.name, 'ask_house');
  assert.equal(response.parts[0].functionResponse.id, 'c1');
  assert.deepEqual(contents.at(-2), { role: 'model', parts: [{ text: 'ask_house says hi' }] });
});

test('setting the language is not an answer: the model goes on to answer the question', async () => {
  const s = setup([[fc('set_carer_language', { language: 'hi-IN' })], [fc('ask_house', { question: 'cookies?' })]]);
  await s.brain.handle('क्या माया कुकीज़ खा सकती है?', s.io);
  assert.deepEqual(s.calls.map((c) => c.name), ['set_carer_language', 'ask_house']);
  assert.equal(s.requests.length, 2);
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

test('a handoff goes straight into the teach-back without asking the model again', async () => {
  const s = setup([[fc('start_handoff', { carer_name: 'Dadi', language: 'hi-IN' })]], {
    teachback: { content: [{ type: 'text', text: 'Maya ko kis cheez se allergy hai?' }] },
  });
  await s.brain.handle('Dadi is babysitting tonight, she speaks Hindi', s.io);
  assert.deepEqual(
    s.calls.map((c) => c.name),
    ['start_handoff', 'teachback'],
  );
  assert.equal(s.said.length, 1);
  assert.match(s.said[0], /start_handoff says hi Maya ko kis cheez/);
  assert.equal(s.requests.length, 1);
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
  const loop = Array.from({ length: 10 }, () => [fc('set_carer_language', { language: 'hi-IN' })]);
  const s = setup(loop);
  await s.brain.handle('loop please', s.io);
  assert.ok(s.requests.length <= 3);
});

test('door_check: the device itself asks the parents with the photo, not the model', async () => {
  const s = setup([[fc('door_check', { question: 'should I open the door?' })], [{ text: '' }]], {
    door_check: { content: [{ type: 'text', text: "Don't open the door." }], structuredContent: { ask_parent: { question: 'Someone is at the door', door_event_id: 3 } } },
  });
  await s.brain.handle('someone is knocking, should I open the door?', s.io);
  assert.deepEqual(s.tasks, [{ name: 'ask_parent_and_wait', args: { question: 'Someone is at the door', door_event_id: 3 } }]);
  assert.match(s.said[0], /Don't open the door/);
});

test('tools only for cards (MCP Apps visibility ["app"]) are not offered to the model', async () => {
  const tools = [...TOOLS, { name: 'payment_status', description: 'x', inputSchema: { type: 'object' }, _meta: { ui: { visibility: ['app'] } } }, { name: 'home_screen', description: 'y', inputSchema: { type: 'object' }, _meta: { ui: { visibility: ['model', 'app'] } } }];
  const requests: any[] = [];
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ parts: [{ text: 'Hi' }] }), { status: 200 });
  }) as typeof fetch;
  const brain = new GeminiBrain({ serverOrigin: 'http://server', tools: () => tools as any, instructions: () => undefined, fallback: { name: 'x', handle: async () => {} }, fetchImpl });
  await brain.handle('hello', { say: () => {}, tool: async () => ({ content: [] }) as any, task: () => {} });
  const names = requests[0].functions.map((f: any) => f.name);
  assert.ok(!names.includes('payment_status'));
  assert.ok(names.includes('home_screen'));
});
