// Family setup: the people the house manual is about (children, pets), who to call and in what
// order, the address read out in an emergency, and the household's time zone. Plus "start fresh"
// and "reset to the demo family", so anyone trying the demo starts from a clean house.
import { type DB, nowIso } from '../db.js';
import { seedDemoHousehold } from '../seed.js';
import { contacts, events, household } from './house.js';

export class FamilyError extends Error {}

export interface FamilyMember {
  id?: number;
  name: string;
  kind: 'child' | 'pet';
  age?: string | null;
  /** Free text, e.g. "peanuts and tree nuts". Saved as a safety rule in the parent's words. */
  allergies?: string | null;
}

export interface FamilyContact {
  name: string;
  relation: string;
  phone: string;
  /** Doctors are listed for paramedics but are not asked questions. */
  doctor?: boolean;
}

export interface Family {
  household: { name: string; address: string; timezone: string };
  members: FamilyMember[];
  contacts: FamilyContact[];
}

const DOCTOR_PRIORITY = 9;
const PHONE = /^\+?[\d\s().-]{6,25}$/;

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export function validTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return /\//.test(tz) || tz === 'UTC';
  } catch {
    return false;
  }
}

function allergyText(db: DB, name: string) {
  const rows = db.prepare("SELECT text FROM facts WHERE category = 'allergy' AND subject = ? AND confirmed = 1 ORDER BY id").all(name) as Array<{ text: string }>;
  return rows.map((r) => r.text).join(' ');
}

export function getFamily(db: DB): Family {
  const h = household(db);
  const members = db.prepare('SELECT id, name, kind, age FROM members ORDER BY id').all() as unknown as Array<Required<FamilyMember>>;
  return {
    household: { name: h?.name ?? '', address: h?.address ?? '', timezone: h?.timezone ?? 'America/Los_Angeles' },
    members: members.map((m) => ({ ...m, allergies: allergyText(db, m.name) || null })),
    contacts: contacts(db).map((c) => ({ name: c.name, relation: c.relation, phone: c.phone, doctor: c.priority >= DOCTOR_PRIORITY })),
  };
}

/** Checks and tidies what the parent typed. Throws FamilyError with a message the page can show. */
export function parseFamily(input: any): Family {
  if (!input || typeof input !== 'object') throw new FamilyError('Nothing to save.');
  const name = clean(input.household?.name, 80);
  const address = clean(input.household?.address, 200);
  const timezone = clean(input.household?.timezone, 60);
  if (!name) throw new FamilyError('Give your household a name, e.g. "The Sharma family".');
  if (!validTimezone(timezone)) throw new FamilyError('Choose your time zone.');

  if (!Array.isArray(input.members) || input.members.length > 12) throw new FamilyError('Add up to 12 children and pets.');
  const members: FamilyMember[] = input.members.map((m: any) => {
    const mName = clean(m?.name, 40);
    if (!mName) throw new FamilyError('Every child and pet needs a name.');
    if (m?.kind !== 'child' && m?.kind !== 'pet') throw new FamilyError(`Is ${mName} a child or a pet?`);
    return {
      id: Number.isInteger(m.id) ? m.id : undefined,
      name: mName,
      kind: m.kind,
      age: clean(m.age, 20) || null,
      allergies: clean(m.allergies, 300) || null,
    };
  });
  if (new Set(members.map((m) => m.name.toLowerCase())).size !== members.length) throw new FamilyError('Two children or pets have the same name.');
  if (!members.some((m) => m.kind === 'child')) throw new FamilyError('Add at least one child.');

  if (!Array.isArray(input.contacts) || input.contacts.length > 10) throw new FamilyError('Add up to 10 contacts.');
  const people: FamilyContact[] = input.contacts.map((c: any) => {
    const cName = clean(c?.name, 40);
    const phone = clean(c?.phone, 25);
    if (!cName) throw new FamilyError('Every contact needs a name.');
    if (!PHONE.test(phone)) throw new FamilyError(`Check ${cName}'s phone number.`);
    return { name: cName, relation: clean(c.relation, 40) || 'Contact', phone, doctor: c.doctor === true };
  });
  if (!people.some((c) => !c.doctor)) throw new FamilyError('Add at least one person to call (not only a doctor).');
  if (new Set(people.map((c) => c.name.toLowerCase())).size !== people.length) throw new FamilyError('Two contacts have the same name.');

  return { household: { name, address, timezone }, members, contacts: people };
}

const sentence = (name: string, allergies: string) =>
  /allerg/i.test(allergies) ? allergies.replace(/([^.!])$/, '$1.') : `${name} is allergic to ${allergies.replace(/\.$/, '')}.`;

export function saveFamily(db: DB, input: unknown, by = 'Parent'): Family {
  const f = parseFamily(input);
  const t = nowIso();
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE household SET name = ?, address = ?, timezone = ? WHERE id = 1').run(f.household.name, f.household.address, f.household.timezone);
    db.prepare("INSERT OR IGNORE INTO household (id, name, address, language, timezone) VALUES (1, ?, ?, 'en', ?)").run(
      f.household.name,
      f.household.address,
      f.household.timezone,
    );

    const before = new Map((db.prepare('SELECT id, name FROM members').all() as Array<{ id: number; name: string }>).map((m) => [m.id, m.name]));
    const kept = new Set<number>();
    for (const m of f.members) {
      const old = m.id !== undefined ? before.get(m.id) : undefined;
      if (old !== undefined) {
        kept.add(m.id!);
        db.prepare('UPDATE members SET name = ?, kind = ?, age = ? WHERE id = ?').run(m.name, m.kind, m.age ?? null, m.id!);
        // Renaming a child keeps the rules written about them.
        if (old !== m.name) db.prepare('UPDATE facts SET subject = ? WHERE subject = ?').run(m.name, old);
      } else {
        kept.add(Number(db.prepare('INSERT INTO members (name, kind, age) VALUES (?, ?, ?)').run(m.name, m.kind, m.age ?? null).lastInsertRowid));
      }
      // Allergies are rewritten only when the parent changed them, so rules from the doctor's
      // letter keep their source unless replaced.
      if ((m.allergies ?? '') !== allergyText(db, m.name)) {
        db.prepare("DELETE FROM facts WHERE category = 'allergy' AND subject = ?").run(m.name);
        if (m.allergies) {
          db.prepare(
            "INSERT INTO facts (category, subject, text, source, author, created_at, visibility, risk) VALUES ('allergy', ?, ?, 'setup', ?, ?, 'carer', 'safety')",
          ).run(m.name, sentence(m.name, m.allergies), by, t);
        }
      }
    }
    for (const [id] of before) if (!kept.has(id)) db.prepare('DELETE FROM members WHERE id = ?').run(id);

    db.prepare('DELETE FROM contacts').run();
    let order = 1;
    const insert = db.prepare('INSERT INTO contacts (name, relation, phone, priority) VALUES (?, ?, ?, ?)');
    for (const c of f.contacts) insert.run(c.name, c.relation, c.phone, c.doctor ? DOCTOR_PRIORITY : order++);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  events.emit('family', getFamily(db));
  return getFamily(db);
}

/** Everything about the household. Phone subscriptions and server keys stay. */
function wipe(db: DB) {
  // Anyone still waiting on a question is told it closed.
  const waiting = db.prepare("SELECT id FROM questions WHERE status = 'pending'").all() as Array<{ id: number }>;
  db.exec('BEGIN');
  try {
    for (const table of ['household', 'members', 'facts', 'locations', 'contacts', 'action_plan_steps', 'handoffs', 'questions', 'log_events', 'imports', 'proposals', 'door_events', 'visitors', 'incidents', 'messages', 'payments', 'passes', 'audit']) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.prepare("DELETE FROM settings WHERE key <> 'vapid_keys'").run();
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  for (const { id } of waiting) events.emit('question_closed', { id, reason: 'The house was reset.' });
  events.emit('reset');
}

/** Back to the Sharma family, exactly as a new visitor sees it. */
export function resetToDemo(db: DB) {
  wipe(db);
  seedDemoHousehold(db);
  return getFamily(db);
}

/** An empty house for a family setting up their own. */
export function startFresh(db: DB, timezone: string) {
  if (!validTimezone(timezone)) throw new FamilyError('Choose your time zone.');
  wipe(db);
  db.prepare("INSERT INTO household (id, name, address, language, timezone) VALUES (1, 'Our family', '', 'en', ?)").run(timezone);
  return getFamily(db);
}
