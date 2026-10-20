// The second pair of eyes: the rules decide first; when they find nothing but the words hint at
// danger, an AI is asked too and can only add caution. Never asked about what the rules caught,
// never able to downgrade, and never allowed to hold up an answer for more than its deadline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { buildServer } from '../src/mcp/server.js';
import { resetClock, setDemoTime } from '../src/clock.js';
import { aiSeesEmergency, mightBeDanger } from '../src/domain/safetyNet.js';
import type { AiClient } from '../src/ai/gemini.js';

/** A stand-in model: says "emergency" for the sentences given, and counts what it was asked. */
const fakeAi = (emergencies: RegExp, opts: { hang?: boolean } = {}) => {
  const asked: string[] = [];
  const ai = {
    available: true,
    asked,
    async generateJson(req: { parts: Array<{ text: string }> }) {
      asked.push(req.parts[0].text);
      if (opts.hang) await new Promise(() => {});
      return { data: { emergency: emergencies.test(req.parts[0].text), why: 'test' }, model: 'fake' } as any;
    },
  };
  return ai as unknown as AiClient & { asked: string[] };
};

async function house(ai: AiClient) {
  setDemoTime('19:00', 'America/Los_Angeles', 'Sat');
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  const server = buildServer({ db, taskStore: new InMemoryTaskStore(), escalateAfterMs: 600_000, publicUrl: 'http://127.0.0.1', ai });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  const client = new Client({ name: 'net', version: '0' });
  await client.connect(c);
  await client.callTool({ name: 'start_handoff', arguments: { carer_name: 'Sam', language: 'en' } });
  return { call: async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as any, close: () => client.close() };
}

test('the rules missed it, the words hint at danger, the AI sees an emergency: it becomes one', async () => {
  const ai = fakeAi(/floppy and pale/);
  const h = await house(ai);
  const r = await h.call('ask_house', { question: 'Maya is all floppy and pale on the sofa' });
  assert.equal(r.structuredContent.emergency, true);
  assert.equal(r.structuredContent.escalated_by, 'ai');
  assert.match(ai.asked[0], /the child is all floppy/, 'the model gets roles, not the family\'s names');
  const logged = await h.call('log_event', { text: 'Maya seems floppy and pale' });
  assert.equal(logged.structuredContent.emergency, true);
  await h.close();
  resetClock();
});

test('it can never downgrade: what the rules caught never reaches the AI, and a "no" changes nothing', async () => {
  const ai = fakeAi(/^$/);
  const h = await house(ai);
  const caught = await h.call('ask_house', { question: "Maya can't breathe" });
  assert.equal(caught.structuredContent.emergency, true);
  assert.equal(caught.structuredContent.escalated_by, undefined);
  assert.equal(ai.asked.length, 0, 'not asked about what the rules already caught');
  const ordinary = await h.call('ask_house', { question: 'She has a little cut on her finger, a plaster?' });
  assert.notEqual(ordinary.structuredContent.emergency, true, "the AI's no leaves the rules' answer");
  assert.equal(ai.asked.length, 1);
  // No hint of danger: no AI call at all, and no delay.
  await h.call('ask_house', { question: 'What time is bedtime?' });
  assert.equal(ai.asked.length, 1);
  await h.close();
  resetClock();
});

test('a slow or broken AI never holds up an answer past its deadline', async () => {
  const t = Date.now();
  assert.equal(await aiSeesEmergency(fakeAi(/./, { hang: true }), 'something is sparking', { children: [], pets: [], adults: [] }, 300), null);
  assert.ok(Date.now() - t < 1500);
  const broken = { available: true, generateJson: async () => { throw new Error('quota'); } } as unknown as AiClient;
  assert.equal(await aiSeesEmergency(broken, 'something is sparking', { children: [], pets: [], adults: [] }), null);
  assert.equal(await aiSeesEmergency({ available: false } as AiClient, 'something is sparking', { children: [], pets: [], adults: [] }), null);
  assert.ok(mightBeDanger('Water is pouring onto the stove and sparking'));
  assert.ok(!mightBeDanger('What time is bedtime?'));
});
