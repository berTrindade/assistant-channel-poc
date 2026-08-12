import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEMO_PRINCIPAL, type Principal } from '../src/principal.ts';
import { bookSlot, cancelBooking, RuleViolation } from '../src/rules.ts';
import { createStore } from '../src/store.ts';

const other: Principal = { id: 'other-account', displayName: 'Someone else', scopes: ['booking:write'] };
const readOnly: Principal = { id: 'read-only', displayName: 'Read only', scopes: ['account:read'] };

test('a single-capacity slot goes to whoever asks first', () => {
  const store = createStore();

  const first = bookSlot(store, DEMO_PRINCIPAL, 'slot-101');
  assert.equal(first.booking.status, 'confirmed');

  assert.throws(
    () => bookSlot(store, other, 'slot-101'),
    (error: unknown) => error instanceof RuleViolation && error.reason === 'slot_taken',
  );
});

test('the same idempotency key books once, however many times it arrives', () => {
  const store = createStore();

  const first = bookSlot(store, DEMO_PRINCIPAL, 'slot-101', 'key-abc');
  const retry = bookSlot(store, DEMO_PRINCIPAL, 'slot-101', 'key-abc');

  assert.equal(retry.booking.id, first.booking.id);
  assert.equal(retry.replayed, true);
  assert.equal(store.bookings.size, 1);
  assert.equal(store.slots.get('slot-101')?.remaining, 0);
});

test('booking the same slot twice without a key does not consume two places', () => {
  const store = createStore();

  bookSlot(store, DEMO_PRINCIPAL, 'slot-103');
  const second = bookSlot(store, DEMO_PRINCIPAL, 'slot-103');

  assert.equal(second.replayed, true);
  assert.equal(store.slots.get('slot-103')?.remaining, 1);
});

test('cancelling returns the place, and cancelling again is not an error', () => {
  const store = createStore();

  const { booking } = bookSlot(store, DEMO_PRINCIPAL, 'slot-101');
  assert.equal(store.slots.get('slot-101')?.remaining, 0);

  cancelBooking(store, DEMO_PRINCIPAL, booking.id);
  assert.equal(store.slots.get('slot-101')?.remaining, 1);

  const again = cancelBooking(store, DEMO_PRINCIPAL, booking.id);
  assert.equal(again.status, 'cancelled');
  assert.equal(store.slots.get('slot-101')?.remaining, 1);
});

test("someone else's booking is indistinguishable from one that does not exist", () => {
  const store = createStore();
  const { booking } = bookSlot(store, DEMO_PRINCIPAL, 'slot-101');

  assert.throws(
    () => cancelBooking(store, other, booking.id),
    (error: unknown) => error instanceof RuleViolation && error.reason === 'not_found',
  );
});

test('a caller without the write scope cannot book', () => {
  const store = createStore();

  assert.throws(
    () => bookSlot(store, readOnly, 'slot-101'),
    (error: unknown) => error instanceof RuleViolation && error.reason === 'forbidden',
  );
});
