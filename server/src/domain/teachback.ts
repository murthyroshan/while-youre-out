// Teach-back: before the parents leave, the device asks the carer three quick questions built from
// the house manual and checks the answers. It's the method hospitals use to confirm a patient
// understood their instructions. Checking is deterministic: no AI decides whether an answer is right.
import type { DB } from '../db.js';
import { activeHandoff, contacts, events, visibleFacts, whereIs } from './house.js';
import { normalise } from './safety.js';

export interface TeachbackQuestion {
  id: 'allergy' | 'epipen' | 'first_call';
  ask: string;
  /** Any one of these words in the answer counts as correct. */
  expect: string[];
  /** The right answer, in the parents' words, shown when the carer gets it wrong. */
  answer: string;
}

export interface TeachbackState {
  questions: TeachbackQuestion[];
  index: number;
  results: Array<{ id: string; correct: boolean | null; given: string }>;
  done: boolean;
}

const ALLERGENS = ['peanut', 'nut', 'egg', 'milk', 'dairy', 'wheat', 'gluten', 'soy', 'sesame', 'fish', 'shellfish', 'shrimp', 'bee', 'penicillin', 'latex'];
const LOCATION_STOP = new Set('the a an in on of to by at it is its her his their left right side near next top bottom'.split(' '));

const words = (s: string) => normalise(s).toLowerCase().match(/[a-z]+/g) ?? [];

export function buildQuestions(db: DB): TeachbackQuestion[] {
  const facts = visibleFacts(db, 'carer');
  const child = (db.prepare("SELECT name FROM members WHERE kind = 'child' ORDER BY id LIMIT 1").get() as { name: string } | undefined)?.name ?? 'the child';
  const qs: TeachbackQuestion[] = [];

  const allergy = facts.find((f) => f.category === 'allergy');
  if (allergy) {
    const lower = allergy.text.toLowerCase();
    const found = ALLERGENS.filter((a) => new RegExp(`\\b${a}s?\\b`).test(lower));
    if (found.length) qs.push({ id: 'allergy', ask: `What is ${child} allergic to?`, expect: found, answer: allergy.text });
  }

  const epipen = whereIs(db, 'EpiPen');
  if (epipen) {
    const keys = [...new Set(words(epipen.description).filter((w) => w.length > 2 && !LOCATION_STOP.has(w)))];
    if (keys.length) qs.push({ id: 'epipen', ask: 'Where is the EpiPen kept?', expect: keys, answer: epipen.description });
  }

  const first = contacts(db).find((c) => c.priority < 9);
  if (first) {
    const relation = first.relation.toLowerCase();
    const expect = [first.name.toLowerCase(), relation];
    if (/mom|mum|mother/.test(relation)) expect.push('mom', 'mum', 'mother', 'mommy', 'mummy');
    if (/dad|father/.test(relation)) expect.push('dad', 'father', 'daddy');
    qs.push({ id: 'first_call', ask: 'Who do you call first if anything comes up?', expect, answer: `${first.name} (${first.relation}), ${first.phone}` });
  }
  return qs;
}

const read = (raw: string | null): TeachbackState | null => {
  try {
    return raw ? (JSON.parse(raw) as TeachbackState) : null;
  } catch {
    return null;
  }
};

export function teachbackState(db: DB): TeachbackState | null {
  return read(activeHandoff(db)?.teachback ?? null);
}

function save(db: DB, handoffId: number, s: TeachbackState) {
  db.prepare('UPDATE handoffs SET teachback = ? WHERE id = ?').run(JSON.stringify(s), handoffId);
  events.emit('teachback', s);
}

export function isCorrect(q: TeachbackQuestion, answer: string) {
  const given = new Set(words(answer).flatMap((w) => [w, w.replace(/s$/, '')]));
  return q.expect.some((e) => e.split(/\s+/).every((part) => given.has(part) || given.has(part.replace(/s$/, ''))));
}

export function summary(s: TeachbackState) {
  const right = s.results.filter((r) => r.correct).length;
  const corrected = s.results.filter((r) => r.correct === false).map((r) => s.questions.find((q) => q.id === r.id)?.ask ?? r.id);
  return { right, total: s.questions.length, skipped: s.results.filter((r) => r.correct === null).length, corrected };
}

export type TeachbackStep =
  | { kind: 'question'; question: string; number: number; total: number; feedback?: Feedback }
  | { kind: 'done'; feedback?: Feedback; summary: ReturnType<typeof summary> }
  | { kind: 'unavailable'; reason: string };
type Feedback = { correct: boolean | null; answer: string };

/** Starts the check, or records an answer (or a skip) and moves to the next question. */
export function teachback(db: DB, input: { answer?: string; skip?: boolean; restart?: boolean }): TeachbackStep {
  const h = activeHandoff(db);
  if (!h) return { kind: 'unavailable', reason: 'There is no handoff in progress.' };
  let s = read(h.teachback);
  if (!s || input.restart) {
    const questions = buildQuestions(db);
    if (!questions.length) return { kind: 'unavailable', reason: "The house manual doesn't have anything to check yet." };
    s = { questions, index: 0, results: [], done: false };
    save(db, h.id, s);
    return { kind: 'question', question: questions[0].ask, number: 1, total: questions.length };
  }
  if (s.done) return { kind: 'done', summary: summary(s) };

  const q = s.questions[s.index];
  let feedback: Feedback | undefined;
  if (input.skip || input.answer !== undefined) {
    const correct = input.skip ? null : isCorrect(q, input.answer ?? '');
    s.results.push({ id: q.id, correct, given: (input.answer ?? '').slice(0, 200) });
    feedback = { correct, answer: q.answer };
    s.index++;
    s.done = s.index >= s.questions.length;
    save(db, h.id, s);
  }
  if (s.done) return { kind: 'done', feedback, summary: summary(s) };
  return { kind: 'question', question: s.questions[s.index].ask, number: s.index + 1, total: s.questions.length, feedback };
}
