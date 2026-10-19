// Records the add-on's real answers for the website's game (site/src/game/answers.json): the same
// tools, the same demo family, the same safety rules, so "Ask the Echo Show" in the game shows what
// the add-on actually says, without the game depending on the live demo being awake.
//   npx tsx eval/record-game.ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js';
import { setDemoTime } from '../src/clock.js';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { buildServer } from '../src/mcp/server.js';
import { recordDoorEvent } from '../src/domain/door.js';
import { buildQuestions } from '../src/domain/teachback.js';

const OUT = fileURLToPath(new URL('../../site/src/game/answers.json', import.meta.url));
const TZ = 'America/Los_Angeles';
const db = openDb(':memory:');
seedDemoHousehold(db);
const server = buildServer({ db, taskStore: new InMemoryTaskStore(), escalateAfterMs: 600_000, publicUrl: 'https://while-youre-out-wpj3.onrender.com', ai: { available: false } as any });
const [c, s] = InMemoryTransport.createLinkedPair();
await server.connect(s);
const client = new Client({ name: 'record-game', version: '1' });
await client.connect(c);
const text = (r: any) => (r.content ?? []).filter((x: any) => x.type === 'text').map((x: any) => x.text).join(' ').replace(/^(Reminder: [^.]*\.\s*)+/, '');
const call = async (name: string, args: Record<string, unknown> = {}) => (await client.callTool({ name, arguments: args })) as any;

setDemoTime('18:00', TZ, 'Sat');
await call('start_handoff', { carer_name: 'Priya', language: 'en' });
const answers: Record<string, { said: string; topic?: string; facts?: string[] }> = {};
const keep = (key: string, r: any, topic?: string) => {
  const d = r.structuredContent ?? {};
  answers[key] = { said: text(r), ...(topic ? { topic } : {}), facts: (d.facts ?? []).map((f: any) => `${f.text} (${f.said_by})`).slice(0, 3) };
};

setDemoTime('18:40', TZ, 'Sat');
keep('cookies', await call('ask_house', { question: 'Can Maya have the cookies on the counter?' }), 'Food');
keep('banana', await call('ask_house', { question: 'Can she have a banana instead?' }), 'Food');
setDemoTime('19:10', TZ, 'Sat');
keep('episode', await call('ask_house', { question: 'Can she watch one more episode before her bath?' }), 'TV');
keep('scary', await call('ask_house', { question: 'Can she watch a scary movie?' }), 'TV');
setDemoTime('20:10', TZ, 'Sat');
recordDoorEvent(db, { kind: 'person', label: 'Person at the front door', snapshot_url: '/static/door/stranger.jpg', source: 'ring (simulated)' });
keep('door', await call('door_check', { question: "A man says he's from the gas company and needs to come in. Should I open?" }), 'Front door');
setDemoTime('20:20', TZ, 'Sat');
keep('ate', await call('ask_house', { question: "Maya ate a granola bar from her friend's bag. Is that okay?" }), 'Food');
const e = await call('emergency', { description: "Maya's lips are swelling and she's coughing" });
answers.emergency = { said: text(e), topic: 'Emergency', facts: (e.structuredContent?.action_plan?.steps ?? []).map((x: any) => x.text) };
await call('emergency_step', { action: 'resolved' });
setDemoTime('20:35', TZ, 'Sat');
keep('misses', await call('play_message', {}), 'Goodnight');

const teachback = buildQuestions(db).map((q) => ({ ask: q.ask, answer: q.answer }));
writeFileSync(OUT, `${JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), answers, teachback }, null, 2)}\n`);
console.log(`recorded ${Object.keys(answers).length} answers to site/src/game/answers.json`);
process.exit(0);
