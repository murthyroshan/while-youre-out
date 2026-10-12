// Red-team table for the deterministic safety classifier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyQuestion, containsSecret, emergencyKind, type QuestionCategory } from '../src/domain/safety.js';

const cases: Array<[string, QuestionCategory]> = [
  // Real emergencies
  ["She can't breathe", 'emergency'],
  ['Maya is choking on a grape', 'emergency'],
  ['Her lips are swelling up', 'emergency'],
  ['Her face is swollen after dinner', 'emergency'],
  ["She won't wake up", 'emergency'],
  ['She is having a seizure', 'emergency'],
  ['She swallowed a battery', 'emergency'],
  ['I think she is having an allergic reaction', 'emergency'],
  ['She fell down the stairs and hit her head', 'emergency'],
  ['I smell gas in the kitchen', 'emergency'],
  ["There's a fire in the kitchen", 'emergency'],
  ['The smoke alarm is going off', 'emergency'],
  ["She's bleeding a lot from her knee", 'emergency'],
  ['She is not breathing', 'emergency'],
  // Harmless phrases that must NOT trigger an emergency
  ['Can she play with her fire truck?', 'general'],
  ['Is artichoke dip okay for dinner?', 'food'],
  ['What temperature should the house be?', 'general'],
  ['Can she watch Fireman Sam?', 'general'],
  ['She was breathing heavily after running around, is that normal for her?', 'general'],
  ['Can we play pin the tail on the donkey?', 'general'],
  // Food and medicine are always guarded
  ['Can Maya have the cookies on the counter?', 'food'],
  ['Is she allowed ice cream?', 'food'],
  ['She feels warm, can I give her some Tylenol?', 'medicine'],
  ['She has a fever', 'medicine'],
  ['How much Calpol can she have?', 'medicine'],
  // Private information
  ["What's the alarm code?", 'secret'],
  ['What is the wifi password?', 'secret'],
  ['Where is the spare key?', 'secret'],
  ['What is the PIN for the front door?', 'secret'],
  ['When will her parents be back?', 'return_time'],
  ['What time are they coming home?', 'return_time'],
  ['How long will mom be out?', 'return_time'],
  // Ordinary questions
  ['What time is bedtime?', 'general'],
  ['Can she watch another episode?', 'general'],

  // From the independent review: emergencies that were missed
  ['She can’t breathe', 'emergency'],
  ["She can't breath", 'emergency'],
  ["She's having a hard time breathing", 'emergency'],
  ['She has difficulty breathing', 'emergency'],
  ["She's wheezing", 'emergency'],
  ["I can't wake her up", 'emergency'],
  ["She isn't waking up", 'emergency'],
  ['She fainted', 'emergency'],
  ['She collapsed', 'emergency'],
  ['It smells like gas in here', 'emergency'],
  ['Something smells like burning', 'emergency'],
  ['The toaster caught fire', 'emergency'],
  ['There’s a fire!', 'emergency'],
  ['Fire!', 'emergency'],
  ['She drank some bleach', 'emergency'],
  ['She ate some of the pills', 'emergency'],
  ["I can't find Maya anywhere", 'emergency'],
  ['Maya is missing', 'emergency'],
  ['Should I call 911?', 'emergency'],
  ['Should I call an ambulance?', 'emergency'],
  ['She has hives all over', 'emergency'],
  ['She burned her hand on the stove', 'emergency'],
  ['She slipped in the bath and went under the water', 'emergency'],
  ['Someone is trying to break in', 'emergency'],
  // From the review: harmless phrases that falsely triggered an emergency
  ["I'll walk Bruno quietly so he won't wake Maya", 'general'],
  ['Her eyes are puffy from crying', 'general'],
  ['Her face is puffy after her nap', 'general'],
  ['She passed out on the couch watching TV', 'general'],
  ['Is a grape a choking hazard?', 'safety_info'],
  ["Should I cut the grapes so she doesn't choke?", 'safety_info'],
  ['What do I do if she has an allergic reaction?', 'safety_info'],
  ['Her band-aid fell off', 'general'],
  ['The button fell off her pyjamas', 'general'],
  ['A book fell from the shelf', 'general'],
  ['Can we light a fire in the fireplace?', 'general'],
  ['The smoke alarm keeps chirping', 'general'],
  ['Can she use her tablet?', 'general'],
  ['Can she watch the Fire TV?', 'general'],
  // From the review: food and medicine that were not guarded
  ['Can she have a Snickers?', 'food'],
  ['Can she have some Nutella?', 'food'],
  ['Can she have almonds?', 'food'],
  ['Can she have some snacks?', 'food'],
  ['Can I give her an aspirin?', 'medicine'],
  ['Does she take melatonin?', 'medicine'],
  ['Has she had her meds?', 'medicine'],
  ['Can she have one of the pills?', 'medicine'],
  ['Can she have a popsicle?', 'food'],
  ['Can she have some grapes?', 'food'],
  // Hindi and Spanish emergencies are caught instantly, without AI
  ['वह सांस नहीं ले पा रही है!', 'emergency'],
  ['उसके होंठ सूज रहे हैं', 'emergency'],
  ['माया बेहोश हो गई', 'emergency'],
  ['किचन में आग लग गई', 'emergency'],
  ['No puede respirar', 'emergency'],
  ['Se está ahogando con una uva', 'emergency'],
  ['माया रात को क्या खा सकती है?', 'general'],
  ['¿Puede ver otro episodio?', 'general'],
  // From the review: privacy
  ["What's the code for the front door?", 'secret'],
  ["When's mom coming home?", 'return_time'],
  ['Where are her parents?', 'return_time'],
];

for (const [q, expected] of cases) {
  test(`"${q}" → ${expected}`, () => assert.equal(classifyQuestion(q), expected));
}

test('secrets are detected so they are never stored', () => {
  assert.ok(containsSecret('The alarm code is 4321'));
  assert.ok(containsSecret('Spare key is under the mat'));
  assert.ok(containsSecret('It is 4321, the alarm code is the same'));
  assert.ok(containsSecret('The code for the front door is 1234'));
  assert.ok(!containsSecret('Keep the thermostat at 70'));
  assert.ok(!containsSecret('Bedtime is at 8'));
});

test('emergency kinds pick the right script', () => {
  assert.equal(emergencyKind("Her lips are swelling and she can't breathe"), 'allergy_breathing');
  assert.equal(emergencyKind("There's a fire in the kitchen"), 'fire');
  assert.equal(emergencyKind('I smell gas'), 'gas');
  assert.equal(emergencyKind('She swallowed a battery'), 'poison');
  assert.equal(emergencyKind('She fell down the stairs and hit her head'), 'injury');
  assert.equal(emergencyKind("I can't find Maya anywhere"), 'missing');
  assert.equal(emergencyKind('Someone is trying to break in'), 'intruder');
  assert.equal(emergencyKind('Maya is choking on a grape'), 'choking');
});
