// Bilingual relay: answers in the carer's language, parents' words kept, emergencies never wait for AI.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { languageCode, translateAll } from '../src/domain/translate.js';
import { createApp } from '../src/index.js';
import type { AiClient, JsonRequest } from '../src/ai/gemini.js';

let calls = 0;
let failNext = false;
/** Fake translator: prefixes each item with [lang]. */
const fakeAi: AiClient = {
  available: true,
  async generateJson<T>(req: JsonRequest) {
    calls++;
    if (failNext) {
      failNext = false;
      throw new Error('busy');
    }
    const items = JSON.parse((req.parts[0] as { text: string }).text) as string[];
    const lang = /into (\w+)/.exec(req.system)?.[1] ?? '?';
    return { data: { translations: items.map((t) => `[${lang}] ${t}`) } as T, model: 'fake' };
  },
};

test('language tags are normalised', () => {
  assert.equal(languageCode('hi-IN'), 'hi');
  assert.equal(languageCode('ES'), 'es');
  assert.equal(languageCode('klingon'), 'en');
  assert.equal(languageCode(undefined), 'en');
});

test('translations are cached, and failures fall back to English (null)', async () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  calls = 0;
  const first = await translateAll(db, fakeAi, ['Bedtime is at 8.'], 'hi');
  assert.deepEqual(first, ['[Hindi] Bedtime is at 8.']);
  await translateAll(db, fakeAi, ['Bedtime is at 8.'], 'hi');
  assert.equal(calls, 1, 'second time comes from the cache');
  failNext = true;
  assert.deepEqual(await translateAll(db, fakeAi, ['Something new.'], 'hi'), [null]);
  assert.deepEqual(await translateAll(db, fakeAi, ['Anything'], 'en'), ['Anything'], 'English is never translated');
});

test('emergency lines use fixed translations, never the AI', async () => {
  const db = openDb(':memory:');
  calls = 0;
  const [hi] = await translateAll(db, fakeAi, ['Call 911 now on your phone. Tell them the address on the screen.'], 'hi');
  assert.match(hi!, /911/);
  assert.match(hi!, /कॉल/);
  assert.equal(calls, 0);
});

// ---------- over MCP ----------

let http: Server;
let base: string;
let close: () => void;
let client: Client;
const KEY = 'tr-key';
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;

before(async () => {
  const created = createApp({ parentKey: KEY, ai: fakeAi });
  close = created.close;
  http = created.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
  client = new Client({ name: 'tr-test', version: '0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  await call('start_handoff', { carer_name: 'Dadi', language: 'hi-IN' });
});

after(async () => {
  await client.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('a Hindi-speaking carer hears answers in Hindi, with the parents\' words kept', async () => {
  const r = await call('ask_house', { question: 'सोने का समय क्या है?', question_english: 'What time is bedtime?' });
  assert.match(r.content[0].text, /^\[Hindi\]/);
  assert.equal(r.structuredContent.language, 'hi');
  assert.match(r.structuredContent.english, /lights out at 8/);
  assert.ok(r.structuredContent.facts.some((f: any) => /lights out at 8/.test(f.text)), 'original words still in the data');
});

test('safety rules read the English rendering: a Hindi emergency is an emergency', async () => {
  const r = await call('ask_house', { question: 'वह सांस नहीं ले पा रही है', question_english: "She can't breathe" });
  assert.equal(r.structuredContent.emergency, true);
  const before = calls;
  const e = await call('emergency', { description: 'वह सांस नहीं ले पा रही है', description_english: "She can't breathe" });
  assert.match(e.content[0].text, /911/);
  assert.match(e.content[0].text, /कॉल/);
  assert.equal(calls, before, 'no AI call during an emergency');
});

test('food questions in another language are still guarded', async () => {
  const r = await call('ask_house', { question: 'क्या वह कुकी खा सकती है?', question_english: 'Can she eat a cookie?' });
  assert.equal(r.structuredContent.category, 'food');
  assert.match(r.structuredContent.guard, /Check the label/);
  assert.match(r.structuredContent.english, /not sure, don't give it/);
});

test('parents see the question in English as well as the carer\'s own words', async () => {
  await call('ask_parent', { question: 'क्या वह पार्क जा सकती है?', question_english: 'Can she go to the park?' });
  const s = await (await fetch(`${base}/parent/api/state?k=${KEY}`)).json();
  const q = s.questions.find((x: any) => x.text_english === 'Can she go to the park?');
  assert.ok(q);
  assert.equal(q.text, 'क्या वह पार्क जा सकती है?');
});
