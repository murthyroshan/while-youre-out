// Shadow Parent: learns how the parents tend to answer low-risk questions and says so, with its
// reasons, so a carer can decide without interrupting them. It never decides for anyone, and it
// never applies to food, medicine, safety, private information or emergencies.
// Also busy mode: a parent can say "urgent questions only" for a while.
import type { DB } from '../db.js';
import { localTime, now } from '../clock.js';
import { familyNames, householdTz } from './house.js';
import { classifyQuestion, type FamilyNames, normalise } from './safety.js';

export type ShadowTopic = 'screen' | 'play' | 'bedtime';
export const SHADOW_TOPICS: ShadowTopic[] = ['screen', 'play', 'bedtime'];

const TOPIC_RE: Array<[ShadowTopic, RegExp]> = [
  ['screen', /\b(tv|television|show|shows|episode|episodes|watch|cartoons?|movie|film|tablet|ipad|youtube|screen|bluey|peppa|video games?|games? on)\b/i],
  ['bedtime', /\b(stay up|later bed ?time|bed ?time later|sleep in (your|our|mom'?s|dad'?s|their) bed|sleep with|another story|one more story|night ?light|bed later)\b/i],
  ['play', /\b(play|playing|outside|park|garden|yard|friend|friends|toys?|paint|painting|draw|drawing|crafts?|slime|trampoline|bike|scooter|bubbles)\b/i],
];

const STOP = new Set(
  'a an the is are can could should may might i we she he it to of in on for and or do does what when where how my her his this that be have has with at me you your our their them they allowed okay ok tonight one more another just little bit some'.split(' '),
);
const contentWords = (s: string) => new Set(normalise(s).toLowerCase().match(/[a-z']+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []);

export function shadowTopic(question: string, names?: FamilyNames): ShadowTopic | null {
  if (classifyQuestion(question, names) !== 'general') return null; // never food, medicine, safety, secrets
  return TOPIC_RE.find(([, re]) => re.test(question))?.[0] ?? null;
}

/** What a parent's answer meant: "Yes, that's fine." -> yes; "No, please don't." -> no. */
export function polarity(answer: string): 'yes' | 'no' | null {
  const a = normalise(answer).toLowerCase();
  if (/^(please call me|call me)/.test(a)) return null;
  const no = /^(no|nope|not tonight|not now)\b|\b(don'?t|do not|can'?t|cannot|not allowed|no more|isn'?t allowed|better not)\b/.test(a);
  const yes = /^(yes|yeah|yep|sure|ok|okay|fine|of course|go ahead|sounds good|absolutely)\b|\b(that'?s fine|is fine|it'?s fine|she can|he can|they can|allowed)\b/.test(a);
  if (yes && !no) return 'yes';
  if (no && !yes) return 'no';
  return null;
}

// ---------- settings ----------

export function getSetting(db: DB, key: string): string | null {
  return (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null;
}

export function setSetting(db: DB, key: string, value: string | null) {
  if (value === null) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  else db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function shadowOffTopics(db: DB): ShadowTopic[] {
  try {
    const v = JSON.parse(getSetting(db, 'shadow_off') ?? '[]');
    return Array.isArray(v) ? v.filter((t): t is ShadowTopic => SHADOW_TOPICS.includes(t)) : [];
  } catch {
    return [];
  }
}

export function setShadowTopic(db: DB, topic: ShadowTopic, on: boolean) {
  const off = new Set(shadowOffTopics(db));
  if (on) off.delete(topic);
  else off.add(topic);
  setSetting(db, 'shadow_off', JSON.stringify([...off]));
}

// ---------- the suggestion ----------

export interface ShadowSuggestion {
  topic: ShadowTopic;
  likely: 'yes' | 'no';
  agree: number;
  total: number;
  /** "weekends" / "weekdays" when tonight's kind of day had enough history of its own. */
  days: 'weekends' | 'weekdays' | null;
  by: string;
  examples: string[];
  message: string;
}

const MIN_DECISIONS = 3;
const MIN_AGREEMENT = 0.75;

export function shadowSuggestion(db: DB, question: string): ShadowSuggestion | null {
  const names = familyNames(db);
  const topic = shadowTopic(question, names);
  if (!topic || shadowOffTopics(db).includes(topic)) return null;
  const tz = householdTz(db);
  const words = contentWords(question);
  const past = (db.prepare("SELECT text, answer, answered_by, asked_at FROM questions WHERE status = 'answered' AND answer IS NOT NULL").all() as Array<{
    text: string;
    answer: string;
    answered_by: string;
    asked_at: string;
  }>)
    .filter((q) => shadowTopic(q.text, names) === topic && [...contentWords(q.text)].some((w) => words.has(w)))
    .map((q) => ({ ...q, vote: polarity(q.answer), weekend: localTime(tz, new Date(q.asked_at)).isWeekend }))
    .filter((q): q is typeof q & { vote: 'yes' | 'no' } => q.vote !== null);

  const tonightWeekend = localTime(tz).isWeekend;
  const sameDays = past.filter((q) => q.weekend === tonightWeekend);
  const pool = sameDays.length >= MIN_DECISIONS ? sameDays : past;
  if (pool.length < MIN_DECISIONS) return null;
  const yes = pool.filter((q) => q.vote === 'yes').length;
  const likely: 'yes' | 'no' = yes >= pool.length - yes ? 'yes' : 'no';
  const agree = likely === 'yes' ? yes : pool.length - yes;
  if (agree / pool.length < MIN_AGREEMENT) return null;

  // Name one parent only if every one of these answers came from them.
  const answerers = new Set(pool.map((q) => q.answered_by));
  const by = answerers.size === 1 ? [...answerers][0] : 'The parents';
  const days = pool === sameDays ? (tonightWeekend ? 'weekends' : 'weekdays') : null;
  const message = `${by} said ${likely} to this ${agree} of ${pool.length} times${days ? ` on ${days}` : ''}. It's your call, or I can ask.`;
  return { topic, likely, agree, total: pool.length, days, by, examples: pool.slice(-3).map((q) => q.text), message };
}

// ---------- busy mode ----------

export function busyUntil(db: DB): Date | null {
  const v = getSetting(db, 'busy_until');
  if (!v) return null;
  const until = new Date(v);
  if (Number.isNaN(until.getTime()) || until <= now()) return null;
  return until;
}

/** Turns busy mode on for some minutes (or off with 0). Only urgent questions reach the parents meanwhile. */
export function setBusy(db: DB, minutes: number) {
  if (minutes <= 0) setSetting(db, 'busy_until', null);
  else setSetting(db, 'busy_until', new Date(now().getTime() + Math.min(minutes, 12 * 60) * 60_000).toISOString());
  return busyUntil(db);
}
