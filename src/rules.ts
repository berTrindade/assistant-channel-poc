/**
 * Write rules.
 *
 * The only place determinism lives. Everything here is plain functions over the store
 * with no protocol and no model in sight, which is why it is the part with tests.
 *
 * Three properties the assistant cannot be trusted to provide:
 *   - authorisation, checked per write rather than assumed from the connection
 *   - contention, because two callers will reach for the last slot
 *   - idempotency, because a retried tool call must not book twice
 */

import { hasScope, type Principal } from './principal.ts';
import type { Booking, Store } from './store.ts';

export class RuleViolation extends Error {
  readonly reason: 'forbidden' | 'not_found' | 'slot_taken';

  constructor(reason: RuleViolation['reason'], message: string) {
    super(message);
    this.name = 'RuleViolation';
    this.reason = reason;
  }
}

export type BookResult = {
  booking: Booking;
  /** True when this call was a replay of an earlier one rather than a new booking. */
  replayed: boolean;
};

/**
 * Book a slot for the caller.
 *
 * Idempotent on `idempotencyKey`: the same key always yields the same booking, so a
 * client that retries after a timeout does not end up with two. Callers who omit a key
 * are still protected by the one-booking-per-slot rule below, which is weaker, since it
 * cannot tell a retry from a genuine second attempt.
 */
export const bookSlot = (
  store: Store,
  principal: Principal,
  slotId: string,
  idempotencyKey?: string,
): BookResult => {
  if (!hasScope(principal, 'booking:write')) {
    throw new RuleViolation('forbidden', 'This account cannot make bookings.');
  }

  if (idempotencyKey) {
    const existingId = store.seenKeys.get(idempotencyKey);
    if (existingId) {
      const existing = store.bookings.get(existingId);
      if (existing) return { booking: existing, replayed: true };
    }
  }

  const slot = store.slots.get(slotId);
  if (!slot) {
    throw new RuleViolation('not_found', `No slot with id ${slotId}.`);
  }

  const alreadyHeld = [...store.bookings.values()].find(
    (booking) =>
      booking.slotId === slotId &&
      booking.principalId === principal.id &&
      booking.status === 'confirmed',
  );
  if (alreadyHeld) {
    if (idempotencyKey) store.seenKeys.set(idempotencyKey, alreadyHeld.id);
    return { booking: alreadyHeld, replayed: true };
  }

  if (slot.remaining <= 0) {
    throw new RuleViolation('slot_taken', `Slot ${slotId} was taken while you were deciding.`);
  }

  const booking: Booking = {
    id: `booking-${store.nextBookingId++}`,
    slotId,
    principalId: principal.id,
    status: 'confirmed',
  };

  slot.remaining -= 1;
  store.bookings.set(booking.id, booking);
  if (idempotencyKey) store.seenKeys.set(idempotencyKey, booking.id);

  return { booking, replayed: false };
};

/**
 * Cancel a booking the caller owns. Cancelling twice is not an error, it is the same
 * outcome reached twice, which is what a retrying client will do.
 */
export const cancelBooking = (
  store: Store,
  principal: Principal,
  bookingId: string,
): Booking => {
  if (!hasScope(principal, 'booking:write')) {
    throw new RuleViolation('forbidden', 'This account cannot change bookings.');
  }

  const booking = store.bookings.get(bookingId);
  if (!booking || booking.principalId !== principal.id) {
    // Same answer whether it is missing or someone else's, so the caller cannot probe
    // for other people's booking ids.
    throw new RuleViolation('not_found', `No booking with id ${bookingId}.`);
  }

  if (booking.status === 'cancelled') return booking;

  booking.status = 'cancelled';
  const slot = store.slots.get(booking.slotId);
  if (slot) slot.remaining += 1;

  return booking;
};
