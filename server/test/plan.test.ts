// Live Tonight Plan: parsing the parents' routine, day-specific rules, the nap rule, ticking off and announcements.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db.js';
import { seedDemoHousehold } from '../src/seed.js';
import { startHandoff } from '../src/domain/house.js';
import { applyLogToPlan, nextItem, takeDueAnnouncements, timedSteps, tonightPlan } from '../src/domain/plan.js';
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

test('a step nobody logged stops being "next" once it is late; the evening moves on', () => {
  const db = fresh();
  startHandoff(db, 'Priya');
  const next = (hhmm: string) => nextItem(tonightPlan(db, TZ, undefined, at(hhmm)).items)?.key;
  assert.equal(next('18:40'), 'dinner', 'ten minutes late is still next');
  assert.notEqual(next('20:10'), 'dinner', 'not "dinner, 100 min late" at 8:10 pm');
  assert.equal(tonightPlan(db, TZ, undefined, at('20:10')).items.find((i) => i.key === 'dinner')!.status, 'late', 'still shown as late');
});

test('a reminder that is no longer fresh (the clock jumped) is not said', () => {
  const db = fresh();
  startHandoff(db, 'Priya');
  setDemoTime('19:40', TZ); // bath was 7:15: 25 minutes ago
  assert.ok(!takeDueAnnouncements(db, TZ).some((i) => i.key === 'bath'));
  resetClock();
});

test('after a late nap, "what time is bedtime?" leads with tonight\'s new bedtime, not the usual one', async () => {
  const { app, close } = createApp({ parentKey: 'k' });
  const http = app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const c = new Client({ name: 't', version: '0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(http.address() as any).port}/mcp`)));
  await c.callTool({ name: 'start_handoff', arguments: { carer_name: 'Priya' } });
  await c.callTool({ name: 'log_event', arguments: { text: 'She napped till 5', kind: 'sleep' } });
  const r = (await c.callTool({ name: 'ask_house', arguments: { question: 'What time is bedtime?' } })) as any;
  assert.match(r.content[0].text, /^Tonight, bedtime is 8:30 pm/);
  assert.equal(r.structuredContent.tonight_bedtime, '8:30 pm');
  const bed = (await c.callTool({ name: 'ask_house', arguments: { question: 'Can she sleep in your bed?' } })) as any;
  assert.doesNotMatch(bed.content[0].text, /Tonight, bedtime/, 'not a question about the time');
  await c.close();
  close();
  http.closeAllConnections();
  http.close();
});

test('the demo reset (demo mode only) ends a running handoff and brings back the demo family', async () => {
  const { app, close, db } = createApp({ parentKey: 'k', demo: true });
  const http = app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const base = `http://127.0.0.1:${(http.address() as any).port}`;
  startHandoff(db, 'Priya');
  const r = await fetch(`${base}/demo/reset`, { method: 'POST' });
  assert.equal(r.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM handoffs WHERE ended_at IS NULL').get()!.n, 0);
  close();
  http.closeAllConnections();
  http.close();
  const plain = createApp({ parentKey: 'k' });
  const h2 = plain.app.listen(0, '127.0.0.1');
  await new Promise((res) => h2.once('listening', res));
  assert.equal((await fetch(`http://127.0.0.1:${(h2.address() as any).port}/demo/reset`, { method: 'POST' })).status, 404);
  plain.close();
  h2.closeAllConnections();
  h2.close();
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

test('lights out: the house gets ready for bed (simulated smart home), said and shown once', async () => {
  const { app, close } = createApp({ parentKey: 'k' });
  const http = app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const c = new Client({ name: 't', version: '0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(http.address() as any).port}/mcp`)));
  await c.callTool({ name: 'start_handoff', arguments: { carer_name: 'Priya' } });
  setDemoTime('19:58', TZ);
  const r = (await c.callTool({ name: 'tonight_plan', arguments: { announce: true } })) as any;
  assert.ok(r.structuredContent.due.includes('bedtime'));
  // The TV wasn't on, so lights out doesn't mention it.
  assert.deepEqual(r.structuredContent.smart_home.map((a: any) => a.device), ["Maya's room", 'Front door']);
  assert.match(r.content[0].text, /put on the night light in Maya's room and checked the front door is locked/);
  const again = (await c.callTool({ name: 'tonight_plan', arguments: { announce: true } })) as any;
  assert.equal(again.structuredContent.smart_home ?? null, null, 'once');
  resetClock();
  await c.close();
  close();
  http.closeAllConnections();
  http.close();
});

test("the goodnight message doesn't play twice in a row (she missed her mom, then lights out)", async () => {
  const { app, close } = createApp({ parentKey: 'k' });
  const http = app.listen(0, '127.0.0.1');
  await new Promise((r) => http.once('listening', r));
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const c = new Client({ name: 't', version: '0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${(http.address() as any).port}/mcp`)));
  // The evening starts before the times below, whatever the real time is when the test runs.
  setDemoTime('18:00', TZ);
  await c.callTool({ name: 'start_handoff', arguments: { carer_name: 'Priya' } });
  setDemoTime('19:55', TZ);
  const missing = (await c.callTool({ name: 'play_message', arguments: { when: 'missing' } })) as any;
  assert.equal(missing.structuredContent.view, 'message');
  setDemoTime('19:58', TZ);
  const lightsOut = (await c.callTool({ name: 'tonight_plan', arguments: { announce: true } })) as any;
  assert.ok(lightsOut.structuredContent.due.includes('bedtime'));
  assert.notEqual(lightsOut.structuredContent.view, 'message', 'not played again 3 minutes later');
  assert.ok(lightsOut.structuredContent.smart_home, 'the house still gets ready for bed');
  const home = (await c.callTool({ name: 'home_screen', arguments: {} })) as any;
  assert.equal(home.structuredContent.smart_home.length, 2, 'and the home screen shows it');
  resetClock();
  await c.close();
  close();
  http.closeAllConnections();
  http.close();
});
