import { DatabaseSync } from 'node:sqlite';

export type Visibility = 'parent' | 'carer' | 'child';
export type Risk = 'safety' | 'food_medicine' | 'normal' | 'low';

export interface Fact {
  id: number;
  category: string;
  subject: string | null;
  text: string;
  source: string;
  author: string;
  created_at: string;
  confirmed: number;
  visibility: Visibility;
  risk: Risk;
  expires_at: string | null;
  handoff_id: number | null;
}

export interface Contact {
  id: number;
  name: string;
  relation: string;
  phone: string;
  priority: number;
}

export interface Handoff {
  id: number;
  carer_name: string;
  language: string;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'ended';
  /** Minutes the bedtime routine moved tonight (e.g. +30 after a late nap). */
  plan_shift: number;
  plan_shift_reason: string | null;
  /** JSON arrays of plan item keys. */
  plan_done: string;
  plan_announced: string;
  /** JSON teach-back state. */
  teachback: string | null;
}

export interface Question {
  id: number;
  handoff_id: number | null;
  text: string;
  text_english: string | null;
  category: string;
  urgency: 'urgent' | 'normal' | 'later';
  status: 'pending' | 'answered' | 'expired';
  answer: string | null;
  answered_by: string | null;
  scope: 'tonight' | 'always' | null;
  task_id: string | null;
  contact_index: number;
  /** Set when the question is about someone at the front door. */
  door_event_id: number | null;
  /** A shopping-list question: the item to add if a parent says yes. */
  shopping_item: string | null;
  /** 1 once the carer has been told the answer. */
  heard: number;
  asked_at: string;
  answered_at: string | null;
}

export interface LogEvent {
  id: number;
  handoff_id: number;
  at: string;
  kind: string;
  text: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS household (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en'
);
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,            -- child | pet
  age TEXT
);
CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY,
  category TEXT NOT NULL,        -- allergy | food | medicine | routine | screen | rules | contacts | house | pet
  subject TEXT,                  -- member name the fact is about, if any
  text TEXT NOT NULL,            -- the parent's exact words
  source TEXT NOT NULL,          -- voice | photo | whatsapp | pdf | parent_answer
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 1,
  visibility TEXT NOT NULL DEFAULT 'carer',
  risk TEXT NOT NULL DEFAULT 'normal',
  expires_at TEXT,
  handoff_id INTEGER             -- set for "just tonight" answers; they end with this handoff
);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY,
  item TEXT NOT NULL,
  description TEXT NOT NULL,
  photo_url TEXT
);
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  relation TEXT NOT NULL,
  phone TEXT NOT NULL,
  priority INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS action_plan_steps (
  id INTEGER PRIMARY KEY,
  plan TEXT NOT NULL,            -- e.g. "Maya - peanut allergy"
  step_no INTEGER NOT NULL,
  text TEXT NOT NULL,            -- verbatim from the doctor's plan
  timer_seconds INTEGER
);
CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY,
  carer_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY,
  handoff_id INTEGER,
  text TEXT NOT NULL,
  category TEXT NOT NULL,
  urgency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  answer TEXT,
  answered_by TEXT,
  scope TEXT,
  task_id TEXT,
  contact_index INTEGER NOT NULL DEFAULT 0,
  asked_at TEXT NOT NULL,
  answered_at TEXT
);
CREATE TABLE IF NOT EXISTS translations (
  lang TEXT NOT NULL,
  source TEXT NOT NULL,
  text TEXT NOT NULL,
  PRIMARY KEY (lang, source)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,            -- photo | pdf | text
  label TEXT NOT NULL,           -- e.g. "Fridge note photo", "WhatsApp from Anita"
  author TEXT NOT NULL,
  created_at TEXT NOT NULL,
  model TEXT,
  dropped_secrets INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY,
  import_id INTEGER NOT NULL,
  kind TEXT NOT NULL,            -- fact | location | plan_step | contact
  category TEXT,
  subject TEXT,
  text TEXT NOT NULL,            -- the note's own words
  english TEXT,                  -- translation when the note isn't in English
  item TEXT,                     -- locations: what is kept there
  extra TEXT,                    -- contacts: phone; plan steps: timer seconds
  risk TEXT NOT NULL DEFAULT 'normal',
  confidence REAL NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | accepted | discarded
  conflict_fact_id INTEGER,
  conflict_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  member TEXT,                   -- who the phone belongs to ("Answering as")
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS door_events (
  id INTEGER PRIMARY KEY,
  handoff_id INTEGER,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,            -- person | package
  label TEXT NOT NULL,           -- what the doorbell camera saw, e.g. "Person at the front door"
  snapshot_url TEXT,
  source TEXT NOT NULL DEFAULT 'ring'
);
CREATE TABLE IF NOT EXISTS visitors (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,            -- "Nani", "Pizza from Tony's", "Amazon package"
  kind TEXT NOT NULL,            -- person | delivery
  window TEXT,                   -- the parent's words: "around 7", "7-8 pm"
  from_minutes INTEGER,
  to_minutes INTEGER,
  note TEXT,
  added_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY,
  handoff_id INTEGER,
  started_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  description TEXT NOT NULL,
  script TEXT NOT NULL,          -- JSON: the fixed script shown on screen
  steps TEXT NOT NULL,           -- JSON: [{ text, timer_seconds }]
  current INTEGER NOT NULL DEFAULT 0,
  timers TEXT NOT NULL DEFAULT '[]',
  updates TEXT NOT NULL DEFAULT '[]',
  on_the_way TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active',
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  from_name TEXT NOT NULL,
  for_name TEXT,
  kind TEXT NOT NULL,            -- audio | video
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  when_to_play TEXT NOT NULL,    -- bedtime | missing | any
  caption TEXT,
  token TEXT NOT NULL,           -- lets the Echo Show fetch the media without the parent key
  created_at TEXT NOT NULL,
  played_at TEXT
);
CREATE TABLE IF NOT EXISTS passes (
  id INTEGER PRIMARY KEY,
  handoff_id INTEGER NOT NULL,
  carer TEXT NOT NULL,
  token_hash TEXT NOT NULL,      -- the sitter's link carries the token; only its hash is kept
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL,          -- active | ended | revoked
  reminded INTEGER NOT NULL DEFAULT 0,
  ended_at TEXT,
  last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  pass_id INTEGER,
  actor TEXT NOT NULL,           -- who acted: "Priya", "Anita"
  via TEXT NOT NULL,             -- where: "the kitchen Echo Show", "Priya's phone", "Anita's phone"
  action TEXT NOT NULL,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  handoff_id INTEGER NOT NULL,
  carer TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  rate_cents INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  tip_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,          -- pending | paid | declined
  token TEXT NOT NULL,           -- the approval page's address (sent by URL elicitation)
  elicitation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS log_events (
  id INTEGER PRIMARY KEY,
  handoff_id INTEGER NOT NULL,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL
);
`;

export type DB = DatabaseSync;

export function openDb(path = process.env.WYO_DB ?? ':memory:'): DB {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  // Older database files: add columns introduced later.
  const addColumn = (table: string, column: string, type: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  };
  addColumn('facts', 'handoff_id', 'INTEGER');
  addColumn('household', 'timezone', "TEXT NOT NULL DEFAULT 'America/Los_Angeles'");
  addColumn('handoffs', 'plan_shift', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('handoffs', 'plan_shift_reason', 'TEXT');
  addColumn('handoffs', 'plan_done', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('handoffs', 'plan_announced', "TEXT NOT NULL DEFAULT '[]'");
  addColumn('handoffs', 'teachback', 'TEXT');
  addColumn('questions', 'text_english', 'TEXT');
  addColumn('questions', 'shopping_item', 'TEXT');
  addColumn('questions', 'heard', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('questions', 'door_event_id', 'INTEGER');
  addColumn('handoffs', 'rate_cents', 'INTEGER');
  return db;
}

// Timestamps follow the server clock, which a demo can move forward.
export { nowIso } from './clock.js';
