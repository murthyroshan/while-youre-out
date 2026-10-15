// The house manual answers with the parents' notes that are really about the question, never a
// note that only shares a little word like "won't".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { answerQuestion } from '../src/domain/house.js';

const fresh = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};

test('"won\'t stop crying" is not answered with "if she won\'t eat dinner"', () => {
  const a = answerQuestion(fresh(), "Maya won't stop crying");
  assert.ok(!a.facts.some((f) => /won't eat/i.test(f.text)), JSON.stringify(a.facts));
});

test('"who do I call?" answers with the family\'s call order, not "the parents haven\'t covered this"', () => {
  for (const q of ['Who should I call if something goes wrong?', 'Who do I contact?', 'What are the emergency contacts?']) {
    const a = answerQuestion(fresh(), q);
    assert.equal(a.suggest_ask_parent, false, q);
    assert.match(a.facts[0]?.text ?? '', /Call order: Anita \(Mom\), then Rahul \(Dad\), then Mrs\. Lee/, q);
    assert.match(a.facts[0].text, /call 911 first/);
  }
  assert.ok(!/Call order/.test(answerQuestion(fresh(), 'Can she call her friend?').facts[0]?.text ?? ''));
});

test('a real match still answers: bedtime finds the bedtime routine', () => {
  const a = answerQuestion(fresh(), 'What time does Maya go to bed?');
  assert.ok(a.facts.some((f) => /lights out/i.test(f.text)), JSON.stringify(a.facts));
});
