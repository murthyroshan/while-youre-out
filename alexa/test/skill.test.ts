// The Alexa skill bridge (alexa/): real Alexa request envelopes, as the Alexa service sends them,
// through the skill to the add-on over MCP. Each turn is a fresh Lambda call: everything the skill
// remembers rides in the session attributes, the way Alexa carries them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../../server/src/index.js';
import { createHouses } from '../../server/src/houses.js';
import { resetClock, setDemoTime } from '../../server/src/clock.js';
import { handle, type AlexaRequest } from '../src/skill';

const KEY = 'alexa-test-key';
const USER = 'amzn1.ask.account.TESTUSER';
let http: Server;
let base: string;
let close: () => void;
let attributes: Record<string, any> = {};

before(async () => {
  const houses = createHouses((url) => createApp({ parentKey: KEY, publicUrl: url, demo: true, escalateAfterMs: 60_000, ai: { available: false } as any }), { publicUrl: 'http://demo.test' });
  close = houses.close;
  http = houses.app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

after(() => {
  resetClock();
  close();
  http.closeAllConnections();
  http.close();
});

const house = `/h/${createHash('sha256').update(`wyo:${USER}`).digest('hex').slice(0, 32)}`;
const envelope = (request: AlexaRequest['request'], screen = true): AlexaRequest => ({
  version: '1.0',
  session: { new: false, attributes, user: { userId: USER } },
  context: {
    System: { user: { userId: USER }, device: { supportedInterfaces: screen ? { 'Alexa.Presentation.APL': { runtime: { maxVersion: '2024.3' } } } : {} } },
    Viewport: { pixelWidth: 1280 },
  },
  request: { locale: 'en-US', ...request },
});
/** Says something to the skill, as Alexa's catch-all intent would deliver it. */
async function say(words: string, screen = true) {
  const r: any = await handle(envelope({ type: 'IntentRequest', intent: { name: 'UtteranceIntent', slots: { utterance: { value: words } } } }, screen), { server: base });
  attributes = r.sessionAttributes;
  return r;
}
const speech = (r: any) => String(r.response.outputSpeech.ssml).replace(/^<speak>|<\/speak>$/g, '');
const card = (r: any) => r.response.directives?.[0]?.datasources?.payload?.card;
const post = (path: string, body: Record<string, unknown>) =>
  fetch(`${base}${house}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ k: KEY, ...body }) });

test('"Alexa, open While You\'re Out": tonight\'s screen, how to start, and the parent link in the Alexa app', async () => {
  setDemoTime('17:50', 'America/Los_Angeles', 'Sat');
  const r: any = await handle(envelope({ type: 'LaunchRequest' }), { server: base });
  attributes = r.sessionAttributes;
  assert.match(speech(r), /Priya is babysitting tonight/);
  assert.equal(r.response.shouldEndSession, false);
  assert.equal(r.response.directives[0].type, 'Alexa.Presentation.APL.RenderDocument');
  assert.match(r.response.card.content, new RegExp(`${house}/parent\\?k=`));
});

test('a whole evening through the skill: handover, a food question, the safe answer, the screen', async () => {
  const start = await say('Priya is babysitting tonight');
  assert.match(speech(start), /Priya/);
  // Straight into the handover check, on screen and by voice.
  assert.equal(card(start).title, 'What is Maya allergic to?');
  assert.match(card(start).sub, /Question 1 of 3/);
  await say('peanuts');
  await say('in the drawer by the stove');
  const checked = await say('Anita');
  assert.equal(card(checked).title, 'Handover confirmed');

  const epipen = await say("where's the EpiPen");
  assert.match(speech(epipen), /stove/);
  assert.equal(card(epipen).title, 'EpiPen');

  const satay = await say('can Maya have chicken satay');
  assert.match(speech(satay), /^No\. That can have peanuts in it/);
  assert.equal(card(satay).topic, 'Food');
  assert.ok(card(satay).footer, 'not-medical-advice footer');
});

test('the brain remembers across turns: a question for the parents, answered on the phone, told on the next turn', async () => {
  const asked = await say('ask Anita if she can stay up until 9');
  assert.match(speech(asked), /asking Anita/i);
  const s = await (await fetch(`${base}${house}/parent/api/state?k=${KEY}`)).json();
  const q = s.questions.find((x: any) => /stay up/i.test(x.text));
  assert.ok(q, 'the question reached the parent page');
  await post('/parent/api/answer', { id: q.id, answer: 'Yes, just tonight.', by: 'Anita' });
  const next = await say('what is next');
  assert.match(speech(next), /Anita answered .*Yes, just tonight/);
});

test('an emergency: 911 first, the guide moves on "done", the address shown and never spoken', async () => {
  const e = await say('her lips are swelling');
  // The parents' plan: the EpiPen first, then 911 (step 2, and on the screen from the start).
  assert.match(speech(e), /EpiPen/);
  assert.doesNotMatch(speech(e), /Maple Street/);
  assert.equal(card(e).mood, 'emergency');
  assert.ok(card(e).notes.some((n: any) => /911/.test(n.title) && /Maple Street/.test(n.text)), '911 and the address are on the screen');
  assert.equal(attributes.brain.inEmergency, true);
  const done = await say('done');
  assert.match(card(done).sub, /Step 2 of/);
  const over = await say("it's over, the paramedics are here");
  assert.equal(card(over).title, 'Help has taken over');
});

test('taps on the screen, yes and no, help, a device with no screen, and stop', async () => {
  const tap: any = await handle(envelope({ type: 'Alexa.Presentation.APL.UserEvent', arguments: ['what time is bedtime'] }), { server: base });
  assert.match(speech(tap), /8/);
  const help: any = await handle(envelope({ type: 'IntentRequest', intent: { name: 'AMAZON.HelpIntent' } }), { server: base });
  assert.match(speech(help), /EpiPen|emergency/i);
  const dot = await say('when does Bruno eat', false);
  assert.equal(dot.response.directives, undefined, 'no APL for an Echo Dot');
  assert.match(speech(dot), /cup|7/);
  const stop: any = await handle(envelope({ type: 'IntentRequest', intent: { name: 'AMAZON.StopIntent' } }), { server: base });
  assert.equal(stop.response.shouldEndSession, true);
  const ended: any = await handle(envelope({ type: 'SessionEndedRequest' }), { server: base });
  assert.deepEqual(ended.response, {});
});

test('a server that is asleep or down: a calm answer within Alexa\'s time limit, not a crash', async () => {
  const t = Date.now();
  const r: any = await handle(envelope({ type: 'IntentRequest', intent: { name: 'UtteranceIntent', slots: { utterance: { value: 'where is the EpiPen' } } } }), { server: 'http://127.0.0.1:9' });
  assert.match(speech(r), /waking up/);
  assert.ok(Date.now() - t < 8000);
});
