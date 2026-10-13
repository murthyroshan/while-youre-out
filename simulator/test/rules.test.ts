// Intent tests for the rule-based brain, using a fake device that records tool calls.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuleBrain } from '../src/brain/rules';
import type { DeviceIO } from '../src/brain/types';
import type { ToolResult } from '../src/mcp';

type Call = { name: string; args: Record<string, unknown> };

function fakeDevice(responses: Record<string, Partial<ToolResult>> = {}) {
  const calls: Call[] = [];
  const said: string[] = [];
  const tasks: Call[] = [];
  const io: DeviceIO = {
    say: (t) => void said.push(t),
    tool: async (name, args = {}) => {
      calls.push({ name, args });
      return { content: [{ type: 'text', text: `${name} ok` }], structuredContent: {}, ...responses[name] } as ToolResult;
    },
    task: (name, args) => void tasks.push({ name, args }),
  };
  return { io, calls, said, tasks };
}

const run = async (utterances: string[], responses?: Record<string, Partial<ToolResult>>) => {
  const brain = new RuleBrain();
  const dev = fakeDevice(responses);
  for (const u of utterances) await brain.handle(u, dev.io);
  return dev;
};

const askOffer = { ask_house: { structuredContent: { suggest_ask_parent: true } } };

// ---------- handoffs ----------

test('"Priya is babysitting tonight" starts a handoff for Priya', async () => {
  const d = await run(['Priya is babysitting tonight']);
  assert.deepEqual(d.calls[0], { name: 'start_handoff', args: { carer_name: 'Priya', replace: false } });
});

test('"Alexa, start handoff for dadi" works with the wake word', async () => {
  const d = await run(['Alexa, start handoff for dadi']);
  assert.deepEqual(d.calls[0], { name: 'start_handoff', args: { carer_name: 'Dadi', replace: false } });
});

for (const u of [
  'Who is babysitting tonight?',
  'She is watching TV',
  'Maya is watching Bluey',
  'Mom is looking after the house plants',
  'Rahul is taking care of the bill',
  "I'm handing over to my sister",
  'Anita is looking after her mom',
]) {
  test(`"${u}" does not start a handoff`, async () => {
    const d = await run([u]);
    assert.ok(!d.calls.some((c) => c.name === 'start_handoff'), JSON.stringify(d.calls));
  });
}

test('"We\'re back" asks before ending the handoff', async () => {
  const d = await run(['Priya is babysitting tonight', "We're back", 'yes']);
  assert.deepEqual(
    d.calls.map((c) => c.name).filter((n) => n !== 'teachback'),
    ['start_handoff', 'end_handoff'],
  );
  assert.ok(d.said.some((t) => /Should I end Priya's handoff/.test(t)));
});

test('saying no keeps the handoff running', async () => {
  const d = await run(['Priya is babysitting tonight', "We're back from the park", 'no']);
  assert.ok(!d.calls.some((c) => c.name === 'end_handoff'));
});

test('"I\'m back" and "Is mom back?" never end the handoff', async () => {
  assert.ok(!(await run(["I'm back, sorry I was in the bathroom"])).calls.some((c) => c.name === 'end_handoff'));
  assert.ok(!(await run(['Is mom back yet?'])).calls.some((c) => c.name === 'end_handoff'));
});

test('"end the handoff" ends it directly', async () => {
  const d = await run(['Priya is babysitting tonight', 'End the handoff']);
  assert.equal(d.calls.at(-1)!.name, 'end_handoff');
});

test('a second handoff asks before replacing the first', async () => {
  const brain = new RuleBrain();
  const calls: Call[] = [];
  const said: string[] = [];
  let active = false;
  const io: DeviceIO = {
    say: (t) => void said.push(t),
    task: () => {},
    tool: async (name, args = {}) => {
      calls.push({ name, args });
      if (name === 'start_handoff' && active && !args.replace) {
        return {
          content: [{ type: 'text', text: 'Priya is already looking after things. Should I end that handoff and start one for Dadi?' }],
          structuredContent: { view: 'handoff_conflict' },
          isError: true,
        };
      }
      if (name === 'start_handoff') active = true;
      return { content: [{ type: 'text', text: 'ok' }], structuredContent: {} };
    },
  };
  await brain.handle('Priya is babysitting tonight', io);
  await brain.handle('Dadi is babysitting tonight', io);
  assert.ok(said.some((t) => /already looking after things/.test(t)));
  await brain.handle('yes', io);
  assert.deepEqual(calls.filter((c) => c.name !== 'teachback').at(-1), { name: 'start_handoff', args: { carer_name: 'Dadi', replace: true } });
});

test('a handoff runs the teach-back check and treats replies as answers', async () => {
  let step = 0;
  const d = await run(['Priya is babysitting tonight', 'Peanuts', 'skip', 'Her mom', 'What time is bedtime?'], {
    teachback: {
      get structuredContent() {
        step++;
        return { kind: step < 4 ? 'question' : 'done' };
      },
    } as any,
  });
  assert.deepEqual(
    d.calls.map((c) => [c.name, c.args]),
    [
      ['start_handoff', { carer_name: 'Priya', replace: false }],
      ['teachback', {}],
      ['teachback', { answer: 'Peanuts' }],
      ['teachback', { skip: true }],
      ['teachback', { answer: 'Her mom' }],
      ['ask_house', { question: 'What time is bedtime?' }],
    ],
  );
});

test('an emergency during teach-back still goes straight to the emergency tool', async () => {
  const d = await run(['Priya is babysitting tonight', "She's choking!"], { teachback: { structuredContent: { kind: 'question' } } });
  assert.equal(d.calls.at(-1)!.name, 'emergency');
});

// ---------- confirmations ----------

test('"yes" with nothing pending does not ask a parent "yes"', async () => {
  const d = await run(['yes']);
  assert.equal(d.tasks.length, 0);
  assert.equal(d.calls.length, 0);
});

test('offer to ask, then "yes", asks the original question', async () => {
  const d = await run(['Can she sleep in your bed?', 'yes'], askOffer);
  assert.deepEqual(d.tasks[0], { name: 'ask_parent_and_wait', args: { question: 'Can she sleep in your bed?' } });
});

test('"no" clears the offer so a later "yes" does nothing', async () => {
  const d = await run(['Can she sleep in your bed?', 'no', 'yes'], askOffer);
  assert.equal(d.tasks.length, 0);
});

test('a stale offer is cleared by any other request', async () => {
  const d = await run(['Can she sleep in your bed?', "Where's the EpiPen?", 'Okay'], askOffer);
  assert.equal(d.tasks.length, 0);
});

// ---------- emergencies come first ----------

for (const u of [
  "She can't breathe",
  "Okay, she can't breathe",
  "No, she's not breathing!",
  "Please help, she's choking",
  "Hey she's choking",
  "Don't know what happened, she won't wake up",
  "Where's the EpiPen, she can't breathe",
  'Ask mom what to do, she is choking',
  'She ate something and her lips are swelling',
]) {
  test(`"${u}" goes straight to the emergency tool`, async () => {
    const d = await run([u]);
    assert.deepEqual(
      d.calls.map((c) => c.name),
      ['emergency'],
    );
    assert.equal(d.tasks.length, 0);
  });
}

test('a log the server flags as an emergency still triggers the emergency tool', async () => {
  const d = await run(['She ate dinner and now she looks really unwell'], { log_event: { structuredContent: { emergency: true } } });
  assert.deepEqual(
    d.calls.map((c) => c.name),
    ['log_event', 'emergency'],
  );
});

test('an allergy alert from a log is read out', async () => {
  const d = await run(['She ate half a Snickers bar'], { log_event: { structuredContent: { allergy_alert: 'Watch for swelling.' } } });
  assert.ok(d.said.includes('Watch for swelling.'));
});

// ---------- routing ----------

test('"where\'s the EpiPen" uses where_is; "where are her parents" does not', async () => {
  assert.deepEqual((await run(["Where's the EpiPen?"])).calls[0], { name: 'where_is', args: { item: 'EpiPen' } });
  assert.equal((await run(['Where are her parents?'])).calls[0].name, 'ask_house');
});

test('where_is falls back to the manual when the location is unknown', async () => {
  const d = await run(["Where's Maya's dinner?"], { where_is: { structuredContent: { found: false } } });
  assert.deepEqual(
    d.calls.map((c) => c.name),
    ['where_is', 'ask_house'],
  );
});

test('status updates are logged; questions are not', async () => {
  assert.equal((await run(['She fell asleep at 8:10'])).calls[0].name, 'log_event');
  assert.equal((await run(['Used the last diaper'])).calls[0].name, 'log_event');
  assert.equal((await run(["We're out of milk"])).calls[0].name, 'log_event');
  assert.equal((await run(['Is she asleep?'])).calls[0].name, 'ask_house');
  assert.equal((await run(['Did she eat dinner?'])).calls[0].name, 'ask_house');
});

test('"ask mom if she can have dessert" asks the right question', async () => {
  const d = await run(['Ask mom if she can have dessert']);
  assert.deepEqual(d.tasks[0].args, { question: 'she can have dessert' });
});

// ---------- photo check-in ----------

test('"Send Mom a photo saying good night" takes a photo and sends it with the caption', async () => {
  const brain = new RuleBrain();
  const dev = fakeDevice({ send_photo: { content: [{ type: 'text', text: 'Sent. Anita will see it on their phone.' }] } });
  dev.io.capture = async () => ({ data: 'AAAA', mime: 'image/jpeg' });
  await brain.handle('Send Mom a photo saying good night', dev.io);
  assert.deepEqual(dev.calls, [{ name: 'send_photo', args: { image_base64: 'AAAA', mime_type: 'image/jpeg', caption: 'Good night' } }]);
  assert.deepEqual(dev.said, ['Okay, smile!', 'Sent. Anita will see it on their phone.']);
});

test('"take a picture of us" works without a caption; no camera is said plainly', async () => {
  const brain = new RuleBrain();
  const dev = fakeDevice();
  dev.io.capture = async () => ({ data: 'BBBB', mime: 'image/jpeg' });
  await brain.handle("Let's take a picture of us for Dad", dev.io);
  assert.deepEqual(dev.calls[0].args, { image_base64: 'BBBB', mime_type: 'image/jpeg' });
  const none = await run(['Send them a photo']);
  assert.equal(none.calls.length, 0);
  assert.match(none.said[0], /doesn't have a camera/);
});

test('"Can she take pictures with my phone?" is a question for the house, not a photo', async () => {
  const d = await run(['Can she take pictures with my phone?']);
  assert.equal(d.calls[0].name, 'ask_house');
});

test('a photo request during the teach-back is not taken as an answer, and the check carries on', async () => {
  const brain = new RuleBrain();
  const dev = fakeDevice({ teachback: { structuredContent: { kind: 'question' } } });
  dev.io.capture = async () => ({ data: 'CCCC', mime: 'image/jpeg' });
  await brain.handle('Priya is babysitting tonight', dev.io);
  await brain.handle('Take a photo for Mom', dev.io);
  await brain.handle('Peanuts', dev.io);
  assert.deepEqual(
    dev.calls.map((c) => c.name),
    ['start_handoff', 'teachback', 'send_photo', 'teachback'],
  );
  assert.deepEqual(dev.calls[3].args, { answer: 'Peanuts' });
});

// ---------- Tonight screen buttons and calls ----------

test('"Call Mom" places an Alexa call through the device', async () => {
  const brain = new RuleBrain();
  const dev = fakeDevice();
  const called: string[] = [];
  dev.io.call = async (who) => (called.push(who), 'Anita');
  await brain.handle('Call Mom', dev.io);
  assert.deepEqual(called, ['Mom']);
  assert.deepEqual(dev.said, ['Calling Anita.']);
  assert.equal(dev.calls.length, 0);
});

test('"Ask the parents" then the question sends that question', async () => {
  const d = await run(['Ask the parents', 'Can we go to the park?']);
  assert.match(d.said[0], /What should I ask them/);
  assert.deepEqual(d.tasks, [{ name: 'ask_parent_and_wait', args: { question: 'Can we go to the park?' } }]);
});

test('"How\'s it going?" shows the Tonight screen', async () => {
  const d = await run(["How's it going?"]);
  assert.equal(d.calls[0].name, 'home_screen');
});

test('the Emergency button on the screen runs the emergency script', async () => {
  const d = await run(['Emergency']);
  assert.equal(d.calls[0].name, 'emergency');
});

// ---------- front door ----------

test('"Someone\'s knocking, should I open?" checks the door and sends the photo to the parents', async () => {
  const d = await run(["Someone's knocking, should I open the door?"], {
    door_check: { content: [{ type: 'text', text: "Don't open the door." }], structuredContent: { ask_parent: { question: 'Someone you didn’t list is at the door', door_event_id: 7 } } },
  });
  assert.equal(d.calls[0].name, 'door_check');
  assert.deepEqual(d.said, ["Don't open the door."]);
  assert.deepEqual(d.tasks, [{ name: 'ask_parent_and_wait', args: { question: 'Someone you didn’t list is at the door', door_event_id: 7 } }]);
});

test('a delivery needs no parent; "where is the door key" is not a door check', async () => {
  const delivery = await run(["Who's at the door?"], { door_check: { content: [{ type: 'text', text: "It's a delivery." }], structuredContent: { ask_parent: null } } });
  assert.equal(delivery.tasks.length, 0);
  const key = await run(['Where is the front door key?']);
  assert.notEqual(key.calls[0].name, 'door_check');
});

// ---------- emergency guide ----------

test('during an emergency, "done", "next" and "it\'s over" move the guide on', async () => {
  const d = await run(["She can't breathe", 'Done', 'I gave the EpiPen', 'Next step', "It's over, the paramedics are here", 'Done'], {
    emergency_step: { content: [{ type: 'text', text: 'Next, step 2 of 5' }], structuredContent: {} },
  });
  assert.deepEqual(
    d.calls.map((c) => [c.name, c.args.action ?? null]),
    [['emergency', null], ['emergency_step', 'done'], ['emergency_step', 'done'], ['emergency_step', 'next'], ['emergency_step', 'resolved'], ['emergency_step', 'done']],
  );
});

test('the guide ends when it is over; "done" afterwards is an ordinary sentence again', async () => {
  const d = await run(["She can't breathe", "It's over, the paramedics are here", 'Done'], {
    emergency_step: { content: [{ type: 'text', text: 'Okay.' }], structuredContent: { resolved: true } },
  });
  assert.deepEqual(d.calls.map((c) => c.name), ['emergency', 'emergency_step', 'ask_house']);
});

test('"done" with no emergency does not touch the guide', async () => {
  const d = await run(['Done']);
  assert.notEqual(d.calls[0]?.name, 'emergency_step');
});

// ---------- goodnight message ----------

test('"Maya misses her mom" plays the parents\' message; "play Mom\'s message" too', async () => {
  const sad = await run(['Maya misses her mom']);
  assert.deepEqual(sad.calls[0], { name: 'play_message', args: { when: 'missing' } });
  const asked = await run(["Play Mom's goodnight message"]);
  assert.deepEqual(asked.calls[0], { name: 'play_message', args: { when: 'any' } });
  const question = await run(['Does she miss her mom when she naps?']);
  assert.notEqual(question.calls[0].name, 'play_message');
});
