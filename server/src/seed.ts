import { type DB, nowIso } from './db.js';

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
  const facts: Array<[string, string | null, string, string, string, string, string]> = [
    ['allergy', 'Maya', 'Maya is allergic to peanuts. Nothing with peanuts or "may contain nuts" on the label.', 'pdf', 'Anita', 'carer', 'safety'],
    ['food', 'Maya', 'Dinner is the dal and rice in the fridge. Heat it for 2 minutes.', 'whatsapp', 'Anita', 'carer', 'food_medicine'],
    ['food', 'Maya', "If she won't eat dinner, she can have a banana or toast with butter.", 'voice', 'Anita', 'carer', 'food_medicine'],
    ['food', 'Maya', 'No sweets after 6 pm.', 'photo', 'Anita', 'carer', 'food_medicine'],
    ['medicine', 'Maya', 'No medicine unless I say so on the phone.', 'voice', 'Anita', 'carer', 'food_medicine'],
    ['routine', 'Maya', 'Bath at 7:15, pyjamas, brush teeth, two stories, lights out at 8.', 'photo', 'Anita', 'carer', 'normal'],
    ['routine', 'Maya', 'If her nap ends after 4 pm, bedtime moves 30 minutes later.', 'voice', 'Rahul', 'carer', 'normal'],
    ['screen', 'Maya', 'One hour of TV at most. Bluey or Peppa Pig only.', 'whatsapp', 'Anita', 'carer', 'low'],
    ['rules', 'Maya', 'No friends over tonight.', 'voice', 'Rahul', 'carer', 'normal'],
    ['pet', 'Bruno', 'Bruno gets one cup of dry food at 7 pm, then a short walk around the block.', 'voice', 'Rahul', 'carer', 'normal'],
    ['house', null, 'The thermostat is in the hallway. Keep it at 70.', 'voice', 'Rahul', 'carer', 'low'],
    // Parent-only: never revealed to a carer or child.
    ['private', null, "We'll be back around 11.", 'voice', 'Anita', 'parent', 'normal'],
  ];
  for (const [category, subject, text, source, author, visibility, risk] of facts) {
    fact.run(category, subject, text, source, author, t, visibility, risk);
  }

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
