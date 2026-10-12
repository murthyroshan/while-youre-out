// Teach-back: questions come from the manual, answers are checked without AI, parents see the result.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { startHandoff, events } from '../src/domain/house.js';
import { buildQuestions, isCorrect, teachback, teachbackState } from '../src/domain/teachback.js';

const fresh = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};

test('questions are built from the house manual', () => {
  const qs = buildQuestions(fresh());
  assert.deepEqual(
    qs.map((q) => q.id),
    ['allergy', 'epipen', 'first_call'],
  );
  assert.equal(qs[0].ask, 'What is Maya allergic to?');
  assert.ok(qs[0].expect.includes('peanut'));
  assert.ok(qs[1].expect.includes('stove'));
  assert.ok(qs[2].expect.includes('anita') && qs[2].expect.includes('mom'));
});

test('answers are judged by meaning words, not exact phrasing', () => {
  const [allergy, epipen, call] = buildQuestions(fresh());
  assert.ok(isCorrect(allergy, 'Peanuts'));
  assert.ok(isCorrect(allergy, "She's allergic to peanut butter"));
  assert.ok(!isCorrect(allergy, 'Strawberries'));
  assert.ok(isCorrect(epipen, 'In the drawer by the stove'));
  assert.ok(isCorrect(epipen, 'red pouch in the kitchen'));
  assert.ok(!isCorrect(epipen, 'In the bathroom cabinet'));
  assert.ok(isCorrect(call, 'Her mom'));
  assert.ok(isCorrect(call, 'Anita'));
  assert.ok(!isCorrect(call, 'The neighbour'));
});

test('a full check: wrong answers get the parents\' words, the result is saved and announced', () => {
  const db = fresh();
  startHandoff(db, 'Priya');
  const announced: unknown[] = [];
  const listener = (s: unknown) => announced.push(s);
  events.on('teachback', listener);

  const q1 = teachback(db, {});
  assert.equal(q1.kind, 'question');
  const q2 = teachback(db, { answer: 'Peanuts' });
  assert.equal(q2.kind === 'question' && q2.feedback?.correct, true);
  const q3 = teachback(db, { answer: 'Upstairs somewhere?' });
  assert.equal(q3.kind === 'question' && q3.feedback?.correct, false);
  assert.match(q3.kind === 'question' ? q3.feedback!.answer : '', /left of the stove/);
  const done = teachback(db, { answer: 'Mom' });
  assert.equal(done.kind, 'done');
  assert.deepEqual(done.kind === 'done' && [done.summary.right, done.summary.total], [2, 3]);
  assert.equal(teachbackState(db)!.done, true);
  assert.ok(announced.length >= 3);
  events.off('teachback', listener);
});

test('skipping is recorded, and asking again after it is done just repeats the result', () => {
  const db = fresh();
  startHandoff(db, 'Priya');
  teachback(db, {});
  teachback(db, { skip: true });
  teachback(db, { answer: 'stove' });
  const done = teachback(db, { answer: 'Anita' });
  assert.equal(done.kind === 'done' && done.summary.skipped, 1);
  const again = teachback(db, { answer: 'anything' });
  assert.equal(again.kind, 'done');
});

test('no handoff, no check', () => {
  assert.equal(teachback(fresh(), {}).kind, 'unavailable');
});
