import { EventEmitter } from 'node:events';
import { currentHouse } from '../context.js';
import { addToShoppingList, SHOP_ANSWERS } from './shopping.js';
import { type DB, type Fact, type Contact, type Handoff, type Question, type LogEvent, nowIso } from '../db.js';
import {
  classifyQuestion,
  FOOD_GUARD,
  MEDICINE_GUARD,
  SECRET_REFUSAL,
  RETURN_TIME_REFUSAL,
  SAFETY_INFO_NOTE,
  containsSecret,
  normalise,
  type QuestionCategory,
} from './safety.js';

export type Role = 'parent' | 'carer';

const defaultEvents = new EventEmitter();
/** The house's event bus: each demo house has its own (see context.ts). */
export const events: EventEmitter = new Proxy(defaultEvents, {
  get(target, prop) {
    const bus = currentHouse()?.events ?? target;
    const value = Reflect.get(bus, prop, bus);
    return typeof value === 'function' ? value.bind(bus) : value;
  },
});
// Each waiting ask-a-parent task listens for answers; allow many at once without warnings.
events.setMaxListeners(200);

// ---------- reads ----------

export function household(db: DB) {
  return db.prepare('SELECT name, address, language, timezone FROM household WHERE id = 1').get() as
    | { name: string; address: string; language: string; timezone: string }
    | undefined;
}

/** The household's IANA time zone, used for tonight's plan and anything shown as a clock time. */
export const householdTz = (db: DB) => household(db)?.timezone ?? 'America/Los_Angeles';

export function activeHandoff(db: DB): Handoff | undefined {
  return db.prepare("SELECT * FROM handoffs WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as
    | Handoff
    | undefined;
}

/** Facts the given role may see. Expired "just tonight" rules are excluded. */
export function visibleFacts(db: DB, role: Role): Fact[] {
  const rows = db
    .prepare('SELECT * FROM facts WHERE confirmed = 1 AND (expires_at IS NULL OR expires_at > ?) ORDER BY id')
    .all(nowIso()) as unknown as Fact[];
  return role === 'parent' ? rows : rows.filter((f) => f.visibility !== 'parent');
}

export function contacts(db: DB): Contact[] {
  return db.prepare('SELECT * FROM contacts ORDER BY priority').all() as unknown as Contact[];
}

/**
 * The parents (or guardians) among the contacts: photos of the children and the debrief go to them,
 * not to a neighbour who is only there to answer in a pinch. Falls back to the first contact.
 */
export function parentNames(db: DB): string[] {
  const chain = contacts(db).filter((c) => c.priority < 9);
  const parents = chain.filter((c) => /\b(mom|mum|mother|mommy|mummy|mama|dad|father|daddy|papa|parent|guardian|step ?(mom|dad))\b/i.test(c.relation));
  return (parents.length ? parents : chain.slice(0, 1)).map((c) => c.name);
}

export function locations(db: DB) {
  return db.prepare('SELECT item, description, photo_url FROM locations ORDER BY id').all() as Array<{
    item: string;
    description: string;
    photo_url: string | null;
  }>;
}

export function actionPlan(db: DB) {
  return db.prepare('SELECT plan, step_no, text, timer_seconds FROM action_plan_steps ORDER BY step_no').all() as Array<{
    plan: string;
    step_no: number;
    text: string;
    timer_seconds: number | null;
  }>;
}

// ---------- answering the carer ----------

const TOPIC_CATEGORIES: Array<[RegExp, string[]]> = [
  [/\b(bed|bedtime|sleep|nap|bath|pyjama|pajama|stories|story|teeth|lights out|night)\b/i, ['routine']],
  [/\b(tv|screen|watch|show|episode|ipad|tablet|cartoon|bluey|peppa|youtube|game)\b/i, ['screen']],
  [/\b(dog|cat|walk|pet|feed the dog|feed the cat|litter)\b/i, ['pet']],
  [/\b(friend|friends|visit|outside|park|play ?date|neighbou?r)\b/i, ['rules']],
  [/\b(thermostat|heat|heating|cold|warm|temperature in)\b/i, ['house']],
  [/\b(call|phone|number|doctor|contact|emergency)\b/i, ['contacts']],
];

export interface HouseAnswer {
  category: QuestionCategory;
  /** Parent's exact words that answer the question, newest first within a topic. */
  facts: Array<{ text: string; said_by: string; source: string; when: string; category: string; risk: string }>;
  /** Mandatory sentence the assistant must say with the facts (food/medicine/privacy). */
  guard: string | null;
  /** True when the manual does not settle the question and a parent should be asked. */
  suggest_ask_parent: boolean;
  /** True when the question describes an emergency: the assistant must call the emergency tool. */
  emergency: boolean;
  /** False when the facts are only related to the question and don't settle it. */
  exact: boolean;
}

export function answerQuestion(db: DB, question: string, role: Role = 'carer'): HouseAnswer {
  const category = classifyQuestion(question);
  const base: HouseAnswer = { category, facts: [], guard: null, suggest_ask_parent: false, emergency: false, exact: true };

  if (category === 'emergency') return { ...base, emergency: true };
  if (category === 'safety_info') {
    // "What do I do if...": the parents' safety facts and how to get the plan, without alerting anyone.
    const safety = visibleFacts(db, 'carer').filter((f) => f.category === 'allergy' || f.risk === 'safety');
    return { ...base, facts: safety.map(toAnswerFact), guard: SAFETY_INFO_NOTE };
  }
  if (category === 'secret') return { ...base, guard: SECRET_REFUSAL };
  if (category === 'return_time' && role !== 'parent') return { ...base, guard: RETURN_TIME_REFUSAL };

  const facts = visibleFacts(db, role);
  let wanted: string[] = [];
  if (category === 'food') wanted = ['allergy', 'food'];
  else if (category === 'medicine') wanted = ['medicine', 'allergy'];
  for (const [re, cats] of TOPIC_CATEGORIES) if (re.test(question)) wanted.push(...cats);
  // The family's own pets by name ("Did Bruno eat?").
  const q = compact(question);
  const pets = db.prepare("SELECT name FROM members WHERE kind = 'pet'").all() as Array<{ name: string }>;
  if (pets.some((p) => compact(p.name) && q.includes(compact(p.name)))) wanted.push('pet');

  // Topic matches plus close keyword matches (e.g. rules learned from earlier parent answers).
  const byTopic = facts.filter((f) => wanted.includes(f.category));
  const byWords = keywordMatch(facts, question, byTopic.length ? 2 : 1);
  const matched = [...new Set([...byWords.filter((f) => f.source === 'parent_answer'), ...byTopic, ...byWords])];
  // Safety facts always lead; then answers parents gave for this exact kind of question.
  matched.sort((a, b) => rank(a) - rank(b) || Number(b.source === 'parent_answer') - Number(a.source === 'parent_answer'));

  const out: HouseAnswer = {
    ...base,
    facts: matched.slice(0, 5).map(toAnswerFact),
  };
  // "Who do I call?": the family's call order is in their contacts, not in a note.
  if (WHO_TO_CALL.test(question)) {
    const chain = contacts(db).filter((c) => c.priority < 9);
    const doctor = contacts(db).find((c) => c.priority >= 9);
    if (chain.length) {
      const order = chain.map((c) => `${c.name} (${c.relation.replace(/\s*\((.*)\)/, ', $1')})`).join(', then ');
      const text = `Call order: ${order}.${doctor ? ` For a doctor's question: ${doctor.name} (${doctor.relation}).` : ''} In an emergency, call 911 first. Say "Call ${chain[0].name}" to call from here.`;
      out.facts.unshift({ text, said_by: 'The family contacts', source: 'contacts', when: nowIso(), category: 'contacts', risk: 'normal' });
      return { ...out, exact: true, suggest_ask_parent: false };
    }
  }
  if (category === 'food') {
    out.guard = FOOD_GUARD;
    out.suggest_ask_parent = true;
  } else if (category === 'medicine') {
    out.guard = MEDICINE_GUARD;
    out.suggest_ask_parent = true;
  } else if (matched.length === 0) {
    out.suggest_ask_parent = true;
  } else if (PERMISSION.test(question) && !matched.some((f) => wholeWordOverlap(f.text, question) >= 2)) {
    // "Can she sleep in your bed?" is about bedtime, but the routine doesn't answer it.
    out.exact = false;
    out.suggest_ask_parent = true;
  }
  return out;
}

const toAnswerFact = (f: Fact) => ({ text: f.text, said_by: f.author, source: f.source, when: f.created_at, category: f.category, risk: f.risk });

const WHO_TO_CALL = /\b(who|whom)\b.{0,30}\b(call|phone|ring|contact|reach)\b|\b(call order|phone numbers?|emergency contacts?|contact list)\b/i;

const PERMISSION =
  /\b(can|could|may|is (she|he|they) allowed|are (they|we) allowed|is it ok(ay)?|is (that|this) (ok|okay|alright|all right|fine)|would it be (ok|okay|fine)|do you think (she|he|they) can|should (i|we)|mind if)\b|\b(ok|okay|alright|fine|allowed)\s*\?\s*$/i;

function contentWords(text: string) {
  return new Set(text.toLowerCase().match(/[a-z']+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? []);
}

/** Whether a note and a question share a real word ("YouTube"), not just a topic. */
export const sharesWords = (note: string, question: string) => wholeWordOverlap(note, question) >= 1;

function wholeWordOverlap(a: string, b: string) {
  const wa = contentWords(a);
  return [...contentWords(b)].filter((w) => wa.has(w)).length;
}

function topicCategory(text: string): string | undefined {
  return TOPIC_CATEGORIES.find(([re]) => re.test(text))?.[1][0];
}

function rank(f: Fact) {
  return { safety: 0, food_medicine: 1, normal: 2, low: 3 }[f.risk] ?? 4;
}

const STOP = new Set(
  'a an the is are can could should may might i we she he it to of in on for and or do does what when where how my her his this that be have has with at me you your our their them they allowed okay ok tonight one more another some any little bit just please really very much also too get got let lets let\'s if so then now still maya won\'t wont don\'t dont can\'t cant isn\'t doesn\'t didn\'t wouldn\'t shouldn\'t will would stop keep keeps going want wants need needs make'.split(' '),
);

function keywordMatch(facts: Fact[], q: string, minScore = 1): Fact[] {
  const words = q.toLowerCase().match(/[a-z']+/g)?.filter((w) => w.length > 2 && !STOP.has(w)) ?? [];
  if (words.length === 0) return [];
  return facts
    .map((f) => ({ f, score: words.filter((w) => f.text.toLowerCase().includes(w)).length }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.f);
}

const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Finds a stored location whose full name appears in the request ("her EpiPen" finds EpiPen; "pen" finds nothing). */
export function whereIs(db: DB, item: string) {
  const q = compact(item);
  if (!q) return undefined;
  return locations(db).find((l) => {
    const name = compact(l.item).replace(/s$/, '');
    return name.length > 0 && q.includes(name);
  });
}

// ---------- handoff ----------

export class HandoffInProgressError extends Error {
  constructor(public current: Handoff) {
    super(`A handoff for ${current.carer_name} is already in progress.`);
  }
}

export function startHandoff(db: DB, carerName: string, language = 'en', opts: { replace?: boolean; rateCents?: number | null } = {}): Handoff {
  const current = activeHandoff(db);
  // Never silently replace a handoff: that would close its questions and "just tonight" rules.
  if (current && !opts.replace) throw new HandoffInProgressError(current);
  if (current) endHandoff(db);
  const info = db
    .prepare("INSERT INTO handoffs (carer_name, language, started_at, status, rate_cents) VALUES (?, ?, ?, 'active', ?)")
    .run(carerName, language, nowIso(), opts.rateCents ?? null);
  const h = db.prepare('SELECT * FROM handoffs WHERE id = ?').get(info.lastInsertRowid) as unknown as Handoff;
  events.emit('handoff', h);
  return h;
}

export function endHandoff(db: DB) {
  const h = activeHandoff(db);
  if (!h) return undefined;
  const t = nowIso();
  db.prepare("UPDATE handoffs SET status = 'ended', ended_at = ? WHERE id = ?").run(t, h.id);
  // "Just tonight" answers end with the handoff they were given in.
  db.prepare('UPDATE facts SET expires_at = ? WHERE handoff_id = ? AND expires_at IS NOT NULL AND expires_at > ?').run(t, h.id, t);
  // Tonight's expected visitors were for tonight.
  db.prepare('DELETE FROM visitors').run();
  // Questions nobody answered are closed so they stop showing on the parent's phone.
  const closing = db.prepare("SELECT id FROM questions WHERE handoff_id = ? AND status = 'pending'").all(h.id) as Array<{ id: number }>;
  db.prepare("UPDATE questions SET status = 'expired' WHERE handoff_id = ? AND status = 'pending'").run(h.id);
  // Waiting ask-a-parent tasks finish instead of hanging until their TTL.
  for (const { id } of closing) events.emit('question_closed', { id, reason: 'The handoff ended before anyone answered.' });
  events.emit('handoff_ended', h);
  return h;
}

/** Tonight's briefing: the few things a new carer must know, in the parents' words. */
export function briefing(db: DB) {
  const facts = visibleFacts(db, 'carer');
  const pick = (cat: string) => facts.filter((f) => f.category === cat).map((f) => f.text);
  const firstContact = contacts(db)[0];
  const epipen = whereIs(db, 'EpiPen');
  return {
    must_know: pick('allergy'),
    epipen: epipen?.description ?? null,
    dinner: pick('food'),
    bedtime: pick('routine'),
    screen: pick('screen'),
    pets: pick('pet'),
    rules: pick('rules'),
    first_contact: firstContact ? `${firstContact.name} (${firstContact.relation})` : null,
    address: household(db)?.address ?? null,
  };
}

// ---------- evening log ----------

export function logEvent(db: DB, text: string, kind = 'note'): LogEvent {
  const h = activeHandoff(db);
  if (!h) throw new Error('No active handoff. Start one before logging.');
  const info = db.prepare('INSERT INTO log_events (handoff_id, at, kind, text) VALUES (?, ?, ?, ?)').run(h.id, nowIso(), kind, text);
  const ev = db.prepare('SELECT * FROM log_events WHERE id = ?').get(info.lastInsertRowid) as unknown as LogEvent;
  events.emit('log', ev);
  return ev;
}

const COMMON_ALLERGENS = ['peanut', 'tree nut', 'nut', 'egg', 'milk', 'dairy', 'wheat', 'gluten', 'soy', 'sesame', 'fish', 'shellfish', 'shrimp'];

// Everyday products that contain an allergen without naming it.
const ALLERGEN_SYNONYMS: Record<string, string[]> = {
  peanut: ['snickers', "reese's", 'reeses', 'peanut butter', 'pb&j', 'pbj', 'satay', 'nutter butter'],
  nut: ['nutella', 'almond', 'almonds', 'cashew', 'cashews', 'hazelnut', 'hazelnuts', 'walnut', 'walnuts', 'pecan', 'pecans', 'pistachio', 'pistachios', 'praline', 'marzipan'],
  'tree nut': ['nutella', 'almond', 'cashew', 'hazelnut', 'walnut', 'pecan', 'pistachio', 'marzipan'],
  egg: ['mayo', 'mayonnaise', 'meringue', 'custard'],
  milk: ['cheese', 'butter', 'yogurt', 'yoghurt', 'ice cream', 'cream'],
  dairy: ['cheese', 'butter', 'yogurt', 'yoghurt', 'ice cream', 'cream', 'milk'],
  wheat: ['bread', 'pasta', 'cracker', 'crackers', 'cookie', 'cookies'],
  gluten: ['bread', 'pasta', 'cracker', 'crackers'],
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w: string) => new RegExp(`(^|[^a-z])${escapeRe(w)}s?($|[^a-z])`);

/**
 * Allergens from the child's allergy facts that a piece of text mentions,
 * e.g. "She ate a peanut butter cookie" -> ["peanut"].
 */
export function allergenMentions(db: DB, text: string): string[] {
  const allergyText = visibleFacts(db, 'carer')
    .filter((f) => f.category === 'allergy')
    .map((f) => f.text.toLowerCase())
    .join(' ');
  // "peanut-free", "no peanuts", "without nuts" are reassurances, not exposures.
  const t = normalise(text)
    .toLowerCase()
    .replace(/[a-z']+(?:[ -][a-z']+)?-free\b/g, ' ')
    .replace(/\b(no|without|free of|free from|not any|nothing with)\s+(any\s+)?[a-z'&]+(\s+[a-z'&]+)?/g, ' ');
  const known = COMMON_ALLERGENS.filter((a) => wordRe(a).test(allergyText));
  const hit = (a: string) => wordRe(a).test(t) || (ALLERGEN_SYNONYMS[a] ?? []).some((w) => wordRe(w).test(t));
  // "nut" would also match inside "peanut"; prefer the most specific word.
  return known.filter(hit).filter((a, _, all) => !all.some((b) => b !== a && b.endsWith(a)));
}

export function eveningLog(db: DB, handoffId?: number): LogEvent[] {
  const id = handoffId ?? activeHandoff(db)?.id;
  if (!id) return [];
  return db.prepare('SELECT * FROM log_events WHERE handoff_id = ? ORDER BY at').all(id) as unknown as LogEvent[];
}

// ---------- asking a parent ----------

export function urgencyFor(category: QuestionCategory): Question['urgency'] {
  if (category === 'medicine' || category === 'food' || category === 'emergency' || category === 'safety_info') return 'urgent';
  return 'normal';
}

export function createQuestion(
  db: DB,
  text: string,
  taskId: string | null = null,
  urgencyOverride?: Question['urgency'],
  /** English rendering when the carer spoke another language; safety rules read it. */
  textEnglish?: string | null,
  /** The doorbell event the question is about ("Is this Nani at the door?"). */
  doorEventId?: number | null,
  /** A shopping-list question ("Add diapers to the list?"): never a house rule, never about food safety. */
  shoppingItem?: string | null,
): Question {
  const h = activeHandoff(db);
  // The stricter of the two readings wins (an emergency in either language is an emergency).
  const readings = [classifyQuestion(text), textEnglish ? classifyQuestion(textEnglish) : 'general'] as const;
  const order = ['emergency', 'safety_info', 'medicine', 'food', 'secret', 'return_time', 'general'];
  const category = shoppingItem ? 'general' : [...readings].sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  const info = db
    .prepare(
      'INSERT INTO questions (handoff_id, text, text_english, category, urgency, task_id, asked_at, door_event_id, shopping_item) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(h?.id ?? null, text, textEnglish ?? null, category, urgencyOverride ?? urgencyFor(category), taskId, nowIso(), doorEventId ?? null, shoppingItem ?? null);
  const q = getQuestion(db, Number(info.lastInsertRowid))!;
  events.emit('question', q);
  return q;
}

export function getQuestion(db: DB, id: number): Question | undefined {
  return db.prepare('SELECT * FROM questions WHERE id = ?').get(id) as unknown as Question | undefined;
}

export function pendingQuestions(db: DB): Question[] {
  return db.prepare("SELECT * FROM questions WHERE status = 'pending' ORDER BY id").all() as unknown as Question[];
}

export function attachTask(db: DB, questionId: number, taskId: string) {
  db.prepare('UPDATE questions SET task_id = ? WHERE id = ?').run(taskId, questionId);
}

/** Next contact in the chain, used when the current one does not answer in time. */
export function escalateQuestion(db: DB, id: number): Contact | undefined {
  const q = getQuestion(db, id);
  if (!q || q.status !== 'pending') return undefined;
  const chain = contacts(db).filter((c) => c.priority < 9);
  const next = q.contact_index + 1;
  if (next >= chain.length) return undefined;
  db.prepare('UPDATE questions SET contact_index = ? WHERE id = ?').run(next, id);
  events.emit('question_escalated', { question: getQuestion(db, id), contact: chain[next] });
  return chain[next];
}

export function currentContactFor(db: DB, q: Question): Contact | undefined {
  return contacts(db).filter((c) => c.priority < 9)[q.contact_index];
}

/**
 * Records a parent's answer. "tonight" answers become rules that expire next morning;
 * "always" answers become permanent rules. Both keep the parent's exact words.
 */
export function answerQuestionFromParent(
  db: DB,
  id: number,
  answer: string,
  answeredBy: string,
  scope: 'tonight' | 'always' = 'tonight',
): Question {
  const q = getQuestion(db, id);
  if (!q) throw new Error(`Question ${id} not found`);
  if (q.status !== 'pending') return q;
  // A one-tap yes about food or medicine must not become a standing rule for other foods.
  if (['food', 'medicine', 'emergency', 'safety_info'].includes(q.category) || q.urgency === 'urgent') scope = 'tonight';
  const t = nowIso();
  db.prepare("UPDATE questions SET status = 'answered', answer = ?, answered_by = ?, scope = ?, answered_at = ? WHERE id = ?").run(
    answer,
    answeredBy,
    scope,
    t,
    id,
  );
  // A shopping question just adds to the list (on a yes); it is never a house rule.
  if (q.shopping_item && answer === SHOP_ANSWERS.yes) addToShoppingList(db, q.shopping_item);
  // A "call me" reply or an alert acknowledgement is not a house rule.
  const isRule =
    !q.shopping_item &&
    !/^please call me\.?$/i.test(answer.trim()) &&
    !q.text.startsWith('Urgent:') &&
    // Codes, keys and passwords are passed on once and never stored for future carers.
    !containsSecret(q.text) &&
    !containsSecret(answer);
  if (isRule) {
    // "Just tonight" ends with this handoff (see endHandoff); 18 hours is only a safety net
    // for answers given outside a handoff. No clock times, so no time zone bugs.
    const expires = scope === 'tonight' ? new Date(Date.now() + 18 * 60 * 60 * 1000).toISOString() : null;
    db.prepare(
      `INSERT INTO facts (category, subject, text, source, author, created_at, visibility, risk, expires_at, handoff_id)
       VALUES (?, NULL, ?, 'parent_answer', ?, ?, 'carer', ?, ?, ?)`,
    ).run(
      q.category === 'general' ? topicCategory(q.text) ?? 'rules' : q.category,
      `Q: ${q.text.replace(/\?*$/, '?')} A: ${answer}`,
      answeredBy,
      t,
      q.category === 'food' || q.category === 'medicine' ? 'food_medicine' : 'normal',
      expires,
      scope === 'tonight' ? (q.handoff_id ?? activeHandoff(db)?.id ?? null) : null,
    );
  }
  const updated = getQuestion(db, id)!;
  events.emit('answered', updated);
  return updated;
}

export function expireQuestion(db: DB, id: number, reason = 'Nobody answered in time.') {
  const r = db.prepare("UPDATE questions SET status = 'expired' WHERE id = ? AND status = 'pending'").run(id);
  if (r.changes) events.emit('question_closed', { id, reason });
}
