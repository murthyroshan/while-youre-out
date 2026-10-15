import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { type DB, nowIso } from './db.js';
import { now } from './clock.js';

/** A past date on the given weekday (0 = Sunday), `weeksAgo` weeks back, at 20:00 UTC (midday in Seattle). */
function pastWeekday(weekday: number, weeksAgo: number) {
  const d = now();
  d.setUTCHours(20, 0, 0, 0);
  const back = ((d.getUTCDay() - weekday + 7) % 7) + 7 * weeksAgo;
  d.setUTCDate(d.getUTCDate() - (back === 0 ? 7 : back));
  return d;
}

/**
 * Earlier evenings with sitters, so Shadow Parent has real decisions to learn from and the
 * debrief can compare tonight with past nights.
 */
function seedPastEvenings(db: DB) {
  const handoff = db.prepare("INSERT INTO handoffs (carer_name, language, started_at, ended_at, status, plan_done) VALUES (?, 'en', ?, ?, 'ended', '[]')");
  const question = db.prepare(
    "INSERT INTO questions (handoff_id, text, category, urgency, status, answer, answered_by, scope, asked_at, answered_at) VALUES (?, ?, 'general', 'normal', 'answered', ?, ?, 'tonight', ?, ?)",
  );
  const log = db.prepare('INSERT INTO log_events (handoff_id, at, kind, text) VALUES (?, ?, ?, ?)');
  // [weekday, weeks ago, carer, questions [text, answer, by], woke at night?]
  const evenings: Array<[number, number, string, Array<[string, string, string]>, boolean]> = [
    [6, 6, 'Priya', [['Can she watch another episode?', "Yes, that's fine.", 'Anita']], true],
    [0, 5, 'Dadi', [['Can she watch one more episode?', 'Yes, one more.', 'Anita']], false],
    [2, 5, 'Priya', [['Can she watch another episode?', "No, please don't. School tomorrow.", 'Anita'], ['Can she stay up a bit later?', "No, please don't.", 'Anita']], false],
    [6, 4, 'Priya', [['Can she watch another episode?', "Yes, that's fine.", 'Rahul']], true],
    [3, 3, 'Dadi', [['Can she watch one more show?', 'No, she has had enough TV.', 'Rahul']], false],
    [6, 3, 'Priya', [['Can she watch another episode?', "No, please don't. She's overtired.", 'Anita'], ['Can she stay up later tonight?', "No, please don't.", 'Anita']], true],
    [0, 2, 'Priya', [['Can she watch one more episode?', "Yes, that's fine.", 'Anita']], false],
    [5, 2, 'Priya', [['Can she stay up a little later?', 'No, bedtime is bedtime.', 'Rahul']], true],
  ];
  for (const [weekday, weeks, carer, qs, woke] of evenings) {
    const day = pastWeekday(weekday, weeks);
    const start = new Date(day.getTime() + 4 * 3_600_000); // evening in Seattle
    const end = new Date(start.getTime() + 5 * 3_600_000);
    const id = Number(handoff.run(carer, start.toISOString(), end.toISOString()).lastInsertRowid);
    qs.forEach(([text, answer, by], i) => {
      const asked = new Date(start.getTime() + (1 + i) * 3_600_000).toISOString();
      question.run(id, text, answer, by, asked, asked);
    });
    log.run(id, new Date(start.getTime() + 3.2 * 3_600_000).toISOString(), 'sleep', 'Asleep');
    if (woke) log.run(id, new Date(start.getTime() + 4.2 * 3_600_000).toISOString(), 'sleep', 'Woke up crying, back asleep after a cuddle');
  }
}

// Demo household used for the video and for judges to try immediately.
// The emergency plan below is SAMPLE DATA written for the demo, not medical advice.
export function seedDemoHousehold(db: DB) {
  const already = db.prepare('SELECT COUNT(*) AS n FROM household').get() as { n: number };
  if (already.n > 0) return;

  const t = nowIso();
  db.prepare('INSERT INTO household (id, name, address, language) VALUES (1, ?, ?, ?)').run(
    'The Sharma family',
    '42 Maple Street, Apt 3B, Seattle, WA 98109',
    'en',
  );

  const member = db.prepare('INSERT INTO members (name, kind, age) VALUES (?, ?, ?)');
  member.run('Maya', 'child', '5');
  member.run('Bruno', 'pet', 'dog');

  const contact = db.prepare('INSERT INTO contacts (name, relation, phone, priority) VALUES (?, ?, ?, ?)');
  contact.run('Anita', 'Mom', '+1-206-555-0142', 1);
  contact.run('Rahul', 'Dad', '+1-206-555-0177', 2);
  contact.run('Mrs. Lee', 'Neighbour (Apt 3A)', '+1-206-555-0119', 3);
  contact.run('Dr. Okafor', 'Pediatrician', '+1-206-555-0101', 9);

  const fact = db.prepare(
    `INSERT INTO facts (category, subject, text, source, author, created_at, visibility, risk)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // [category, subject, text, source, author, visibility, risk, days ago it was added]
  const facts: Array<[string, string | null, string, string, string, string, string, number]> = [
    ['allergy', 'Maya', 'Maya is allergic to peanuts. Nothing with peanuts or "may contain nuts" on the label.', 'pdf', 'Anita', 'carer', 'safety', 90],
    ['food', 'Maya', 'Dinner is the dal and rice in the fridge. Heat it for 2 minutes.', 'whatsapp', 'Anita', 'carer', 'food_medicine', 0],
    ['food', 'Maya', "If she won't eat dinner, she can have a banana or toast with butter.", 'voice', 'Anita', 'carer', 'food_medicine', 60],
    ['food', 'Maya', 'No sweets after 6 pm.', 'photo', 'Anita', 'carer', 'food_medicine', 5],
    ['medicine', 'Maya', 'No medicine unless I say so on the phone.', 'voice', 'Anita', 'carer', 'food_medicine', 90],
    ['routine', 'Maya', 'Dinner at 6:30.', 'voice', 'Anita', 'carer', 'normal', 60],
    ['routine', 'Maya', 'Bath at 7:15, pyjamas, brush teeth, two stories, lights out at 8.', 'photo', 'Anita', 'carer', 'normal', 60],
    ['routine', 'Maya', 'If her nap ends after 4 pm, bedtime moves 30 minutes later.', 'voice', 'Rahul', 'carer', 'normal', 6],
    ['screen', 'Maya', 'One hour of TV at most. Gentle cartoons only, nothing scary.', 'whatsapp', 'Anita', 'carer', 'low', 60],
    ['rules', 'Maya', 'No friends over tonight.', 'voice', 'Rahul', 'carer', 'normal', 0],
    ['pet', 'Bruno', 'Bruno gets one cup of dry food at 7 pm, then a short walk around the block.', 'voice', 'Rahul', 'carer', 'normal', 60],
    ['house', null, 'The thermostat is in the hallway. Keep it at 70.', 'voice', 'Rahul', 'carer', 'low', 60],
    ['rules', null, "Don't open the door to anyone you don't know. Deliveries can stay outside until we're back.", 'voice', 'Rahul', 'carer', 'normal', 30],
    // Parent-only: never revealed to a carer or child.
    ['private', null, "We'll be back around 11.", 'voice', 'Anita', 'parent', 'normal', 0],
  ];
  const daysAgo = (n: number) => new Date(now().getTime() - n * 86_400_000).toISOString();
  for (const [category, subject, text, source, author, visibility, risk, age] of facts) {
    fact.run(category, subject, text, source, author, age ? daysAgo(age) : t, visibility, risk);
  }

  seedPastEvenings(db);

  // A goodnight message for lights out. The demo's is a music-box lullaby with the words as a
  // caption; a real parent records their own voice or video on the parent page.
  const lullaby = fileURLToPath(new URL('../public/demo/lullaby.wav', import.meta.url));
  if (existsSync(lullaby)) {
    db.prepare('INSERT INTO messages (from_name, for_name, kind, mime, data, when_to_play, caption, token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'Anita',
      'Maya',
      'audio',
      'audio/wav',
      readFileSync(lullaby),
      'bedtime',
      'Goodnight Maya. Sweet dreams, my love. Mama will give you a big kiss when we get home.',
      randomBytes(16).toString('hex'),
      t,
    );
  }

  // Who the parents said to expect tonight (cleared when the handoff ends).
  const visitor = db.prepare('INSERT INTO visitors (name, kind, window, from_minutes, to_minutes, note, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  visitor.run('Nani', 'person', 'around 7 pm', 18 * 60 + 30, 19 * 60 + 30, "Anita's mom. She may drop off soup.", 'Anita', t);
  visitor.run('Amazon package', 'delivery', '7-8 pm', 19 * 60, 20 * 60, 'The driver leaves it at the door.', 'Anita', t);

  const loc = db.prepare('INSERT INTO locations (item, description, photo_url) VALUES (?, ?, ?)');
  loc.run('EpiPen', 'Kitchen drawer to the left of the stove, in the red pouch.', '/static/photos/epipen-drawer.svg');
  loc.run('First aid kit', 'Bathroom cabinet, top shelf.', '/static/photos/first-aid.svg');
  loc.run('Pyjamas', "Top drawer of Maya's dresser.", null);
  loc.run('Dog food', 'Pantry, bottom shelf, blue tub. The scoop is inside.', null);

  const step = db.prepare('INSERT INTO action_plan_steps (plan, step_no, text, timer_seconds) VALUES (?, ?, ?, ?)');
  const plan = 'Maya - peanut allergy (sample plan)';
  step.run(plan, 1, 'If Maya has trouble breathing, swelling of the lips or tongue, or keeps vomiting after eating: give the EpiPen in the outer thigh right away.', null);
  step.run(plan, 2, 'Call 911. Say "severe allergic reaction" and give the address.', null);
  step.run(plan, 3, 'Lay her down flat. If breathing is hard, let her sit up.', null);
  step.run(plan, 4, 'If she is not better after 5 minutes, use the second EpiPen from the same pouch.', 300);
  step.run(plan, 5, 'Call Mom, then Dad.', null);
}
