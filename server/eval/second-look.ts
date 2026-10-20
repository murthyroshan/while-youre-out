// What the AI's second look makes of the emergencies the rules missed on the independent set's first
// run. The rules have since learnt these lines, so the AI is asked directly, as it would have been then.
//   npx tsx eval/second-look.ts
import { readFileSync } from 'node:fs';
import { geminiFromEnv } from '../src/ai/gemini.js';
import { aiSeesEmergency } from '../src/domain/safetyNet.js';

if (process.env.GEMINI_EVAL_KEY) process.env.GEMINI_API_KEY = process.env.GEMINI_EVAL_KEY;
const ind = JSON.parse(readFileSync(new URL('./independent.json', import.meta.url), 'utf8')) as {
  traps: Array<{ say: string; expect: string }>;
  first_run: { missed: Array<[string, string]> };
};
const missed = new Set(ind.first_run.missed.map(([say]) => say));
const lines = ind.traps.filter((t) => t.expect === 'emergency' && missed.has(t.say)).map((t) => t.say);
const ai = geminiFromEnv();
if (!ai.available) throw new Error('GEMINI_API_KEY is not set (server/.env).');
const names = { children: ['Maya'], pets: ['Bruno'], adults: ['Anita', 'Rahul'] };
let caught = 0;
for (const say of lines) {
  // The live deadline is 2 seconds; here a slow answer is waited for, to see what the model thinks.
  const r = await aiSeesEmergency(ai, say, names, 20_000);
  if (r) caught++;
  console.log(r ? 'caught' : 'missed', '|', say, r ? `| ${r.why}` : '');
}
console.log(`second look: ${caught} of ${lines.length}`);
