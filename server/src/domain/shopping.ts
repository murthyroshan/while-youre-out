// The shopping list agent: the sitter says "we used the last diaper", and the parents are asked
// right away, on their lock screen, whether to add diapers to the family's shopping list. Nothing
// is added without a parent's yes. The list here is simulated; in production it is the family's
// Alexa shopping list.
import type { DB } from '../db.js';
import { getSetting, setSetting } from './shadow.js';

/** What the lock-screen buttons answer. */
export const SHOP_ANSWERS = { yes: 'Yes, add it to the list.', order: 'Order it for tomorrow morning.', no: 'Not now.' } as const;

// "used the last diaper", "we're out of milk", "running low on wipes", "no more bread".
const RAN_OUT = /\b(?:last|ran out of|run out of|out of|finished the|no more|running low on|used the last)\s+(?:the\s+)?([a-z][a-z' -]{1,30}?)(?=[.,!;]|$|\s+(?:so|and|but|for|today|tonight|now)\b)/gi;
// "the last time", "out of the bath": not supplies.
const NOT_SUPPLIES = /^(time|night|minute|hour|bit|one|bath|room|house|bed|breath|reach|sight|control|nowhere|ideas?)$/i;

/** The supplies a sentence says ran out, lowercased, in the carer's words. */
export function suppliesMentioned(text: string): string[] {
  const found = [...text.matchAll(RAN_OUT)].map((m) => m[1].trim().replace(/\s+(today|tonight|now)$/i, '').toLowerCase());
  return [...new Set(found.filter((s) => s && !NOT_SUPPLIES.test(s.split(' ')[0])))];
}

export function shoppingList(db: DB): string[] {
  try {
    const list = JSON.parse(getSetting(db, 'shopping_list') ?? '[]');
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addToShoppingList(db: DB, item: string): string[] {
  const list = [...new Set([...shoppingList(db), item.trim().toLowerCase()])].slice(-50);
  setSetting(db, 'shopping_list', JSON.stringify(list));
  return list;
}

/** "Add diapers to the shopping list?" in the words the parent sees on their phone. */
export const shoppingQuestion = (carer: string, item: string) => `${carer} says you've run out of ${item}. Add ${item} to the shopping list?`;
