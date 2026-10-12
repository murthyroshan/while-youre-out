// Live Tonight Plan: parsing the parents' routine, day-specific rules, the nap rule, ticking off and announcements.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { startHandoff } from '../src/domain/house.js';
import { applyLogToPlan, takeDueAnnouncements, timedSteps, tonightPlan } from '../src/domain/plan.js';
import { localTime, resetClock, setDemoTime, type LocalTime } from '../src/clock.js';
import { createApp } from '../src/index.js';

const TZ = 'America/Los_Angeles';
const at = (hhmm: string, weekday = 'Tue'): LocalTime => {
  const [h, m] = hhmm.split(':').map(Number);
  return { hhmm, minutes: h * 60 + m, weekday, isWeekend: weekday === 'Sat' || weekday === 'Sun', date: '2026-10-13' };
};
const fresh = () => {
  const db = openDb(':memory:');
  seedDemoHousehold(db);
  return db;
};

after(() => resetClock());

test('timed steps are read from the parents\' words; restrictions are not steps', () => {
  const steps = timedSteps({ text: 'Bath at 7:15, pyjamas, brush teeth, two stories, lights out at 8.', author: 'Anita' });
  assert.deepEqual(
    steps.map((s) => [s.title, s.minutes, s.checklist]),
    [
      ['Bath', 19 * 60 + 15, []],
      ['Lights out', 20 * 60, ['Pyjamas', 'Brush teeth', 'Two stories']],
    ],
  );
  assert.deepEqual(timedSteps({ text: 'No sweets after 6 pm.', author: 'Anita' }), []);
  assert.deepEqual(timedSteps({ text: 'Heat it for 2 minutes.', author: 'Anita' }), []);
  assert.equal(timedSteps({ text: 'Bruno gets one cup of dry food at 7 pm, then a short walk.', author: 'Rahul' })[0].checklist[0], 'A short walk');
});

test('the plan is in time order and attributed to the parent who said it', () => {
  const db = fresh();
  const h = startHandoff(db, 'Priya');
  const { items } = tonightPlan(db, TZ, h, at('17:00'));
  assert.deepEqual(
    items.map((i) => [i.key, i.time]),
    [
      ['dinner', '6:30 pm'],
      ['bruno-gets-one-cup-of-dry-food', '7:00 pm'],
      ['bath', '7:15 pm'],
      ['bedtime', '8:00 pm'],
    ],
  );
  assert.equal(items.find((i) => i.key === 'bruno-gets-one-cup-of-dry-food')!.said_by, 'Rahul');
});

test('a Friday-only bedtime applies on Fridays and not on other days', () => {
  const db = fresh();
  db.prepare("INSERT INTO facts (category, subject, text, source, author, created_at, visibility, risk) VALUES ('routine', 'Maya', 'Bedtime 8:30 on Fridays, 2 books', 'photo', 'Anita', '2026-01-01', 'carer', 'normal')").run();
  const h = startHandoff(db, 'Priya');
  assert.equal(tonightPlan(db, TZ, h, at('17:00', 'Fri')).items.find((i) => i.key === 'bedtime')!.time, '8:30 pm');
  assert.equal(tonightPlan(db, TZ, h, at('17:00', 'Tue')).items.find((i) => i.key === 'bedtime')!.time, '8:00 pm');
});

test('a late nap moves the bedtime routine by the parents\' rule, once', () => {
  const db = fresh();
  startHandoff(db, 'Priya');
  assert.equal(applyLogToPlan(db, TZ, 'She napped till 3'), null, 'before 4 pm: no change');
  const change = applyLogToPlan(db, TZ, 'She napped till 5');
  assert.ok(change);
  assert.match(change!.message, /Rahul's rule/);
  assert.equal(change!.new_bedtime, '8:30 pm');
  const items = tonightPlan(db, TZ, undefined, at('17:00')).items;
  assert.equal(items.find((i) => i.key === 'bath')!.time, '7:45 pm', 'bath moves with bedtime');
  assert.equal(items.find((i) => i.key === 'dinner')!.time, '6:30 pm', 'dinner does not move');
  assert.equal(applyLogToPlan(db, TZ, 'Woke from her nap at 5:30'), null, 'only applied once');
});

test('other ways of saying the nap ended are understood', () => {
  for (const text of ['Woke up from her nap at 4:45', 'Nap ended at 5 pm', 'She was up from her nap at 5']) {
    const db = fresh();
    startHandoff(db, 'Priya');
    assert.ok(applyLogToPlan(db, TZ, text), text);
  }
});

test('logs tick items off', () => {
  const db = fresh();
  startHandoff(db, 'Priya');
  applyLogToPlan(db, TZ, 'She had her dinner');
  applyLogToPlan(db, TZ, 'Fell asleep at 8:10');
  const items = tonightPlan(db, TZ, undefined, at('20:20')).items;
  assert.equal(items.find((i) => i.key === 'dinner')!.status, 'done');
  assert.equal(items.find((i) => i.key === 'bedtime')!.status, 'done');
});

test('statuses follow the clock: upcoming, due, late', () => {
  const db = fresh();
  startHandoff(db, 'Priya');
  const s = (hhmm: string) => tonightPlan(db, TZ, undefined, at(hhmm)).items.find((i) => i.key === 'bath')!.status;
  assert.equal(s('18:00'), 'upcoming');
  assert.equal(s('19:12'), 'due');
  assert.equal(s('19:50'), 'late');
});

test('due steps are announced once each, using the demo clock', () => {
  const db = fresh();
  startHandoff(db, 'Priya');
  setDemoTime('19:16', TZ);
  const first = takeDueAnnouncements(db, TZ).map((i) => i.key);
  assert.ok(first.includes('bath'));
  assert.deepEqual(takeDueAnnouncements(db, TZ), [], 'not repeated');
  assert.equal(localTime(TZ).hhmm, '19:16');
  resetClock();
});

test('the demo clock endpoint exists only in demo mode', async () => {
  const off = createApp({ parentKey: 'k' });
  const on = createApp({ parentKey: 'k', demo: true });
  const listen = async (app: any) => {
    const s = app.listen(0, '127.0.0.1');
    await new Promise((r) => s.once('listening', r));
    return s;
  };
  const s1 = await listen(off.app);
  const s2 = await listen(on.app);
  const url = (s: any) => `http://127.0.0.1:${s.address().port}/demo/clock`;
  assert.equal((await fetch(url(s1))).status, 404);
  const set = await fetch(url(s2), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ time: '19:40' }) });
  assert.equal((await set.json()).hhmm, '19:40');
  assert.equal((await fetch(url(s2), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ time: 'later' }) })).status, 400);
  resetClock();
  for (const [s, a] of [[s1, off], [s2, on]] as const) {
    a.close();
    s.closeAllConnections();
    s.close();
  }
});
