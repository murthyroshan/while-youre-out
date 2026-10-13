// The Tonight screen: what's next, the family, the parents' answers, and night mode.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { answerQuestionFromParent, createQuestion, logEvent, startHandoff } from '../src/domain/house.js';
import { homeScreen, homeSentence } from '../src/domain/home.js';
import { teachback } from '../src/domain/teachback.js';
import { resetClock, setDemoTime } from '../src/clock.js';

const TZ = 'America/Los_Angeles';
const fresh = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};
after(() => resetClock());

test('with nobody babysitting: parent mode, with the family and tonight\'s plan', () => {
  setDemoTime('17:00', TZ, 'Sat');
  const s = homeScreen(fresh());
  assert.equal(s.mode, 'parent');
  assert.equal(s.carer, null);
  assert.deepEqual(s.members.map((m) => [m.name, m.allergy]), [['Maya', 'Peanuts'], ['Bruno', null]]);
  assert.deepEqual(s.parents.map((p) => p.name), ['Anita', 'Rahul'], 'the neighbour is not a parent');
  assert.ok(s.plan.some((p) => p.key === 'bedtime'));
  assert.equal(homeSentence(s), 'No one is babysitting right now.');
});

test('during a handoff: what\'s next and how long until it', () => {
  const db = fresh();
  setDemoTime('18:00', TZ, 'Sat');
  startHandoff(db, 'Priya');
  const s = homeScreen(db);
  assert.equal(s.mode, 'carer');
  assert.equal(s.carer, 'Priya');
  assert.equal(s.next?.title, 'Dinner');
  assert.equal(s.next?.minutes_until, 30);
  assert.equal(homeSentence(s), 'Next is dinner at 6:30 pm, in 30 minutes.');
  assert.equal(s.night, false);
});

test('the parents\' latest answer, waiting questions and the handover check show up', () => {
  const db = fresh();
  setDemoTime('18:10', TZ, 'Sat');
  startHandoff(db, 'Priya');
  teachback(db, {});
  for (const a of ['peanuts', 'kitchen drawer by the stove', 'Anita']) teachback(db, { answer: a });
  const q = createQuestion(db, 'Can she have a bath with bubbles?');
  answerQuestionFromParent(db, q.id, 'Yes, a few.', 'Rahul');
  createQuestion(db, 'Can she play outside?');
  const s = homeScreen(db);
  assert.deepEqual(s.teachback && [s.teachback.right, s.teachback.total, s.teachback.done], [3, 3, true]);
  assert.equal(s.last_answer?.by, 'Rahul');
  assert.equal(s.last_answer?.answer, 'Yes, a few.');
  assert.equal(s.questions_waiting, 1);
});

test('night: after "fell asleep at 8:10" the screen goes dim and uses the time the sitter said', () => {
  const db = fresh();
  setDemoTime('20:20', TZ, 'Sat');
  startHandoff(db, 'Priya');
  logEvent(db, 'She fell asleep at 8:10', 'sleep');
  const s = homeScreen(db);
  assert.equal(s.night, true);
  assert.equal(s.asleep_since, '8:10 pm');
  assert.equal(homeSentence(s), 'All quiet. Asleep since 8:10 pm.');
  logEvent(db, 'Woke up crying, getting a cuddle', 'sleep');
  assert.equal(homeScreen(db).asleep_since, null, 'awake again');
});
