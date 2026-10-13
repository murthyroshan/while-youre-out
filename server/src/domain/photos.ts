// Photo check-in: the carer says "send them a photo" and the Echo Show's camera sends a picture of
// the kids to the parents' phones. Photos go only to the parent page, are never shown to a carer
// or sent to an AI model, and are deleted after a week.
import { type DB, nowIso } from '../db.js';
import { activeHandoff, events } from './house.js';
import { now } from '../clock.js';

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_PHOTO_BYTES = 1_500_000;
const KEEP_DAYS = 7;

export class PhotoError extends Error {}

export interface PhotoInfo {
  id: number;
  handoff_id: number | null;
  at: string;
  caption: string | null;
  taken_by: string | null;
}

/** Checks the file really is the image type it claims (magic bytes), not just its label. */
function looksLike(mime: string, b: Buffer) {
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8;
  if (mime === 'image/png') return b.subarray(0, 4).toString('hex') === '89504e47';
  if (mime === 'image/webp') return b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP';
  return false;
}

export function savePhoto(db: DB, input: { data: Buffer; mime: string; caption?: string | null }): PhotoInfo {
  const h = activeHandoff(db);
  if (!PHOTO_TYPES.includes(input.mime)) throw new PhotoError('The photo must be a JPEG, PNG or WebP image.');
  if (!input.data.length) throw new PhotoError('The photo is empty.');
  if (input.data.length > MAX_PHOTO_BYTES) throw new PhotoError('The photo is too large (1.5 MB at most).');
  if (!looksLike(input.mime, input.data)) throw new PhotoError("That isn't a valid image.");
  const caption = input.caption?.trim().slice(0, 200) || null;
  const takenBy = h?.carer_name ?? null;
  const info = db
    .prepare('INSERT INTO photos (handoff_id, at, mime, data, caption, taken_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(h?.id ?? null, nowIso(), input.mime, input.data, caption, takenBy);
  db.prepare('DELETE FROM photos WHERE at < ?').run(new Date(now().getTime() - KEEP_DAYS * 86_400_000).toISOString());
  const photo = getPhotoInfo(db, Number(info.lastInsertRowid))!;
  events.emit('photo', photo);
  return photo;
}

export function getPhotoInfo(db: DB, id: number) {
  return db.prepare('SELECT id, handoff_id, at, caption, taken_by FROM photos WHERE id = ?').get(id) as PhotoInfo | undefined;
}

export function getPhotoData(db: DB, id: number) {
  const row = db.prepare('SELECT mime, data FROM photos WHERE id = ?').get(id) as { mime: string; data: Uint8Array } | undefined;
  return row ? { mime: row.mime, data: Buffer.from(row.data) } : undefined;
}

/** Photos from tonight's handoff plus anything else from the last day, oldest first. */
export function recentPhotos(db: DB, handoffId: number | null | undefined, limit = 12): PhotoInfo[] {
  const since = new Date(now().getTime() - 86_400_000).toISOString();
  const rows = db
    .prepare('SELECT id, handoff_id, at, caption, taken_by FROM photos WHERE handoff_id = ? OR at >= ? ORDER BY id DESC LIMIT ?')
    .all(handoffId ?? -1, since, limit) as unknown as PhotoInfo[];
  return rows.reverse();
}
