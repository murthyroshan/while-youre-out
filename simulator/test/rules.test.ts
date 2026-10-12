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
