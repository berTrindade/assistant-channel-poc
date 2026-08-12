import assert from 'node:assert/strict';
import { test } from 'node:test';

import { intentKey, issueToken, redeemToken } from '../src/confirm.ts';

const SECRET = 'test-secret';
const NOW = 1_760_000_000_000;

const bookSlot101 = intentKey('book_slot', { slotId: 'slot-101' });
const bookSlot102 = intentKey('book_slot', { slotId: 'slot-102' });
const cancelBooking1 = intentKey('cancel_booking', { bookingId: 'booking-1' });

test('a token confirms the change it was issued for', () => {
  const token = issueToken(SECRET, bookSlot101, NOW);

  assert.equal(redeemToken(SECRET, token, bookSlot101, NOW + 1_000), true);
});

test('a token cannot be spent on a different change', () => {
  const token = issueToken(SECRET, bookSlot101, NOW);

  assert.equal(redeemToken(SECRET, token, cancelBooking1, NOW + 1_000), false);
  assert.equal(redeemToken(SECRET, token, bookSlot102, NOW + 1_000), false);
});

test('any instance holding the secret can verify a token it did not issue', () => {
  // The whole point: no shared memory, only a shared secret.
  const issuedByOneReplica = issueToken(SECRET, bookSlot101, NOW);

  assert.equal(redeemToken(SECRET, issuedByOneReplica, bookSlot101, NOW + 1_000), true);
});

test('a token from a different secret is refused', () => {
  const token = issueToken('someone-elses-secret', bookSlot101, NOW);

  assert.equal(redeemToken(SECRET, token, bookSlot101, NOW + 1_000), false);
});

test('a token expires', () => {
  const token = issueToken(SECRET, bookSlot101, NOW, 60_000);

  assert.equal(redeemToken(SECRET, token, bookSlot101, NOW + 59_000), true);
  assert.equal(redeemToken(SECRET, token, bookSlot101, NOW + 61_000), false);
});

test('editing the payload invalidates the signature', () => {
  const token = issueToken(SECRET, bookSlot101, NOW);
  const [, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ intent: cancelBooking1, exp: NOW + 60_000 })).toString(
    'base64url',
  );

  assert.equal(redeemToken(SECRET, `${forged}.${signature}`, cancelBooking1, NOW + 1_000), false);
});

test('malformed tokens are refused rather than throwing', () => {
  for (const token of ['', 'nonsense', 'no-dot-here', '.', 'a.b', '!!!.???']) {
    assert.equal(redeemToken(SECRET, token, bookSlot101, NOW), false);
  }
});

test('a token can be replayed until it expires, which the write path must tolerate', () => {
  // Documented trade rather than an oversight: a self-contained token cannot be
  // consumed without the shared memory this design exists to remove. Safe here because
  // booking is idempotent and contention-checked, so a replay books the slot once.
  const token = issueToken(SECRET, bookSlot101, NOW);

  assert.equal(redeemToken(SECRET, token, bookSlot101, NOW + 1_000), true);
  assert.equal(redeemToken(SECRET, token, bookSlot101, NOW + 2_000), true);
});

test('argument order does not change the intent', () => {
  assert.equal(
    intentKey('book_slot', { slotId: 'slot-101', idempotencyKey: 'k1' }),
    intentKey('book_slot', { idempotencyKey: 'k1', slotId: 'slot-101' }),
  );
});
