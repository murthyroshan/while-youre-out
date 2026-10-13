// A parent's goodnight message: recorded on the phone before leaving ("Goodnight Maya, sweet
// dreams"), played on the Echo Show at lights out, or when the sitter says she's missing her mom.
// It turns the hardest moment of a night with a sitter into the nicest one.
import { randomBytes } from 'node:crypto';
import { type DB, nowIso } from '../db.js';
import { activeHandoff, events } from './house.js';

export const MESSAGE_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'video/webm', 'video/mp4', 'video/quicktime'];
export const MAX_MESSAGE_BYTES = 8_000_000;
const KEEP = 6;

export class MessageError extends Error {}

export type MessageWhen = 'bedtime' | 'missing' | 'any';

export interface MessageInfo {
  id: number;
  from_name: string;
  for_name: string | null;
  kind: 'audio' | 'video';
  mime: string;
  when_to_play: MessageWhen;
  caption: string | null;
  token: string;
  created_at: string;
  played_at: string | null;
}

const COLUMNS = 'id, from_name, for_name, kind, mime, when_to_play, caption, token, created_at, played_at';

export function saveMessage(
  db: DB,
  input: { data: Buffer; mime: string; from: string; for_name?: string | null; when?: string; caption?: string | null },
): MessageInfo {
  const mime = input.mime.split(';')[0].trim().toLowerCase();
  if (!MESSAGE_TYPES.includes(mime)) throw new MessageError('Record audio or video (WebM, MP4, M4A, MP3 or WAV).');
  if (!input.data.length) throw new MessageError('The recording is empty.');
  if (input.data.length > MAX_MESSAGE_BYTES) throw new MessageError('Keep it under a minute (8 MB at most).');
  const when: MessageWhen = input.when === 'missing' || input.when === 'any' ? input.when : 'bedtime';
  const info = db
    .prepare('INSERT INTO messages (from_name, for_name, kind, mime, data, when_to_play, caption, token, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      input.from.slice(0, 40),
      input.for_name?.trim().slice(0, 40) || null,
      mime.startsWith('video/') ? 'video' : 'audio',
      mime,
      input.data,
      when,
      input.caption?.trim().slice(0, 160) || null,
      randomBytes(16).toString('hex'),
      nowIso(),
    );
  db.prepare(`DELETE FROM messages WHERE id NOT IN (SELECT id FROM messages ORDER BY id DESC LIMIT ${KEEP})`).run();
  return getMessage(db, Number(info.lastInsertRowid))!;
}

export function getMessage(db: DB, id: number): MessageInfo | undefined {
  return db.prepare(`SELECT ${COLUMNS} FROM messages WHERE id = ?`).get(id) as MessageInfo | undefined;
}

export function listMessages(db: DB): MessageInfo[] {
  return db.prepare(`SELECT ${COLUMNS} FROM messages ORDER BY id DESC`).all() as unknown as MessageInfo[];
}

export const removeMessage = (db: DB, id: number) => db.prepare('DELETE FROM messages WHERE id = ?').run(id).changes > 0;

/** The media itself, for the Echo Show: only with the message's own unguessable token. */
export function messageMedia(db: DB, id: number, token: unknown) {
  const row = db.prepare('SELECT mime, data, token FROM messages WHERE id = ?').get(id) as { mime: string; data: Uint8Array; token: string } | undefined;
  if (!row || typeof token !== 'string' || token !== row.token) return undefined;
  return { mime: row.mime, data: Buffer.from(row.data) };
}

/**
 * Picks the message for this moment: one recorded for it ("at lights out", "if she misses us"),
 * not yet played tonight first, then any.
 */
export function pickMessage(db: DB, when: MessageWhen): MessageInfo | undefined {
  const all = listMessages(db);
  const h = activeHandoff(db);
  const playedTonight = (m: MessageInfo) => Boolean(m.played_at && h && m.played_at >= h.started_at);
  const fits = (m: MessageInfo) => m.when_to_play === when || m.when_to_play === 'any';
  return all.find((m) => fits(m) && !playedTonight(m)) ?? all.find(fits) ?? all[0];
}

export function markPlayed(db: DB, m: MessageInfo) {
  db.prepare('UPDATE messages SET played_at = ? WHERE id = ?').run(nowIso(), m.id);
  // The parent hears that it landed: "Maya heard your goodnight message".
  events.emit('message_played', { ...m, carer: activeHandoff(db)?.carer_name ?? null });
}
