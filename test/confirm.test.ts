import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createPendingConfirmations,
  intentKey,
  issueToken,
  redeemToken,
} from '../src/confirm.ts';

const bookSlot101 = intentKey('book_slot', { slotId: 'slot-101' });
const bookSlot102 = intentKey('book_slot', { slotId: 'slot-102' });
const cancelBooking1 = intentKey('cancel_booking', { bookingId: 'booking-1' });

test('a token confirms the change it was issued for', () => {
  const pending = createPendingConfirmations();
  const token = issueToken(pending, bookSlot101);

  assert.equal(redeemToken(pending, token, bookSlot101), true);
});

test('a token cannot be spent on a different change', () => {
  const pending = createPendingConfirmations();
  const token = issueToken(pending, bookSlot101);

  assert.equal(redeemToken(pending, token, cancelBooking1), false);
  assert.equal(redeemToken(pending, token, bookSlot102), false);
});

test('being offered against the wrong change does not destroy a token', () => {
  const pending = createPendingConfirmations();
  const token = issueToken(pending, bookSlot101);

  assert.equal(redeemToken(pending, token, cancelBooking1), false);
  assert.equal(redeemToken(pending, token, bookSlot101), true);
});

test('a token is single use', () => {
  const pending = createPendingConfirmations();
  const token = issueToken(pending, bookSlot101);

  assert.equal(redeemToken(pending, token, bookSlot101), true);
  assert.equal(redeemToken(pending, token, bookSlot101), false);
});

test('a token nobody issued is refused', () => {
  const pending = createPendingConfirmations();

  assert.equal(redeemToken(pending, 'not-a-real-token', bookSlot101), false);
  assert.equal(redeemToken(pending, '', bookSlot101), false);
});

test('argument order does not change the intent', () => {
  assert.equal(
    intentKey('book_slot', { slotId: 'slot-101', idempotencyKey: 'k1' }),
    intentKey('book_slot', { idempotencyKey: 'k1', slotId: 'slot-101' }),
  );
});
