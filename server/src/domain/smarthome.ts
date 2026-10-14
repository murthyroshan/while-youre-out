// Lights out for the house: the child's room dims, the night light comes on and the front door is
// checked. Simulated: in production Alexa+ does this with the family's own smart home devices
// (and Ring); the add-on only knows when, from the parents' bedtime routine.
import type { DB } from '../db.js';
import { nowIso } from '../db.js';
import { setSetting } from './shadow.js';

export interface HomeAction {
  device: string;
  state: string;
}

export function bedtimeScene(db: DB): { actions: HomeAction[]; say: string } {
  const kids = (db.prepare("SELECT name FROM members WHERE kind = 'child' ORDER BY id").all() as Array<{ name: string }>).map((k) => k.name);
  const room = kids.length === 1 ? `${kids[0]}'s room` : 'the kids’ rooms';
  const actions = [
    { device: room.charAt(0).toUpperCase() + room.slice(1), state: 'lights dimmed' },
    { device: 'Night light', state: 'on' },
    { device: 'Front door', state: 'locked' },
  ];
  setSetting(db, 'smart_home', JSON.stringify({ at: nowIso(), actions }));
  return { actions, say: `I've dimmed ${room} and checked the front door is locked.` };
}
