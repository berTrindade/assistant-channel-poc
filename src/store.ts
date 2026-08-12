/**
 * Channel state.
 *
 * Stands in for the product APIs a real facade would call, plus the small amount of
 * state the channel owns itself. In-memory on purpose: a PoC that needs a database
 * running before it says anything is a PoC nobody opens.
 *
 * ponytail: in-memory, so state dies with the process. Swap for the real APIs plus a
 * table when the writes need to survive a restart.
 */

export type Slot = {
  id: string;
  service: string;
  startsAt: string;
  capacity: number;
  remaining: number;
};

export type Booking = {
  id: string;
  slotId: string;
  principalId: string;
  status: 'confirmed' | 'cancelled';
};

export type Store = {
  slots: Map<string, Slot>;
  bookings: Map<string, Booking>;
  /** Idempotency keys already honoured, mapped to the booking they produced. */
  seenKeys: Map<string, string>;
  nextBookingId: number;
};

const seedSlots = (): Slot[] => [
  { id: 'slot-101', service: 'Standard service', startsAt: '2026-09-01T09:00:00Z', capacity: 1, remaining: 1 },
  { id: 'slot-102', service: 'Standard service', startsAt: '2026-09-01T11:00:00Z', capacity: 1, remaining: 1 },
  { id: 'slot-103', service: 'Extended service', startsAt: '2026-09-02T14:00:00Z', capacity: 2, remaining: 2 },
];

export const createStore = (): Store => ({
  slots: new Map(seedSlots().map((slot) => [slot.id, slot])),
  bookings: new Map(),
  seenKeys: new Map(),
  nextBookingId: 1,
});

export const listOpenSlots = (store: Store): Slot[] =>
  [...store.slots.values()].filter((slot) => slot.remaining > 0);

export const bookingsFor = (store: Store, principalId: string): Booking[] =>
  [...store.bookings.values()].filter((booking) => booking.principalId === principalId);
