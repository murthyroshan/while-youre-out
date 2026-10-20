// Reading a pasted message (a WhatsApp note, a list) without AI: each sentence becomes a proposed
// house rule in the parent's own words, sorted by plain keywords. It's the floor under the AI
// reader, so setting up never depends on a model being awake: nothing is used until a parent
// confirms it, and codes and passwords are still dropped before anything is stored.
import type { Extracted } from './houseBrain.js';
import { sentences } from './translate.js';

const SKIP = /^(hi|hey|hello|thanks|thank you|thx|ok|okay|see you|bye|love|cheers|have fun|good luck)\b[^a-z]*$|^(hi|hey|hello)\s+\w+[!,.]*$/i;

const CATEGORY: Array<[string, RegExp]> = [
  ['allergy', /\b(allerg\w*|epi-?pen|anaphyla\w*|reaction|hives|swell\w*)\b/i],
  ['medicine', /\b(medicine|medication|meds|pills?|syrup|doses?|tylenol|calpol|ibuprofen|paracetamol|inhaler|vitamins?)\b/i],
  ['screen', /\b(tv|television|cartoons?|ipad|tablet|phone|screen|youtube|shows?|episodes?|games?)\b/i],
  ['pet', /\b(dog|cat|puppy|kitten|walk him|walk her|feed (him|her) at|kibble|leash)\b/i],
  ['food', /\b(eat|eats|ate|food|snacks?|dinner|lunch|breakfast|milk|juice|yogh?urt|fruit|banana|sweets?|candy|chocolate|cookies?|biscuits?|treats?|water|drink)\b/i],
  ['routine', /\b(bed|bedtime|bath|nap|sleep|asleep|wake|pyjamas|pajamas|teeth|stor(y|ies)|lights out|cries|crying|upset|cuddle|comfort)\b/i],
  ['house', /\b(thermostat|heating|lights?|door|lock|keys?|garage|bins?|trash|alarm|wifi|wi-fi)\b/i],
  ['rules', /\b(don'?t|do not|never|no |not allowed|only|must|always)\b/i],
];

const category = (s: string) => CATEGORY.find(([, re]) => re.test(s))?.[0] ?? 'other';

/** The same shape the AI reader returns, from rules alone. */
export function extractWithoutAi(text: string): Extracted {
  const facts = sentences(text.replace(/\r/g, '').replace(/\n+/g, '\n').split('\n').join('. '))
    .map((s) => s.trim().replace(/^[-•*·]\s*/, '').replace(/\.\s*\.$/, '.'))
    .filter((s) => s.split(/\s+/).length >= 3 && !SKIP.test(s))
    .slice(0, 30)
    .map((s) => ({ category: category(s), subject: null, text: /[.!?]$/.test(s) ? s : `${s}.`, english: null, confidence: 0.5 }));
  return { facts, locations: [], action_plan_steps: [], contacts: [] };
}
