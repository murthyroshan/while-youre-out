// Which demo house a request (or a timer it started) belongs to. The public demo gives every
// visitor their own house: its own database, its own event bus and its own demo clock, so two
// judges trying it at once never see each other's evening. Code outside a house (tests, a
// single-house server) uses the defaults.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { EventEmitter } from 'node:events';

export interface HouseContext {
  id: string;
  events: EventEmitter;
  /** The house's demo clock (see clock.ts). */
  clockOffsetMs: number;
}

export const houseStore = new AsyncLocalStorage<HouseContext>();
export const currentHouse = () => houseStore.getStore();
