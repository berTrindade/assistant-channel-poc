/**
 * The confirmation gate.
 *
 * First attempt at this used a `confirm: boolean` argument on the write tools. A real
 * host proved that worthless within a minute: told "Book slot-101", the model set
 * confirm to true on the first call, reasoning that the instruction was itself the
 * agreement, and the booking landed with nothing asked. A flag the model controls is a
 * flag the model will set.
 *
 * So the server issues the confirmation instead. The first call gets no write and a
 * token that only exists here. The second call must present that exact token, bound to
 * that exact change, and it is consumed on use. The model cannot invent one, so it
 * cannot collapse the two turns into one.
 *
 * What this buys, precisely: the change is stated to the user before anything is saved,
 * and a token minted for booking a slot cannot be spent cancelling one. What it does not
 * buy is proof that a human said yes, because no server-side mechanism can prove that.
 * Only host-mediated elicitation can, which is why the tools still try that first and
 * treat this as the fallback.
 *
 * ponytail: in-memory map, single process, no expiry. Two ceilings, and the second is
 * the one that bites. Tokens need a TTL the moment this outlives a demo. More
 * importantly they are process-local, so behind two replicas a token minted on one and
 * presented to the other is refused for no reason the user can see. The protocol is
 * stateless by design and this map quietly reintroduces the affinity it removed. Move it
 * to the same store as the bookings before this runs anywhere with more than one
 * instance.
 */

import { randomUUID } from 'node:crypto';

export type PendingConfirmations = Map<string, string>;

export const createPendingConfirmations = (): PendingConfirmations => new Map();

/**
 * An intent key names the exact change being confirmed. Two different changes never
 * share one, which is what stops a token being redeemed against something else.
 */
export const intentKey = (tool: string, args: Record<string, unknown>): string =>
  `${tool}:${JSON.stringify(args, Object.keys(args).sort())}`;

export const issueToken = (pending: PendingConfirmations, intent: string): string => {
  const token = randomUUID();
  pending.set(token, intent);
  return token;
};

/**
 * Spend a token against the change it was issued for. Returns false for an unknown
 * token, a token issued for a different change, or one already used.
 *
 * A token is consumed only when it matches. Burning it on a mismatch would punish a
 * model that misfires once by forcing the user to be asked again, and buys nothing:
 * a token only ever unlocks the single change it names, so presenting it elsewhere is
 * refused however many times it happens.
 */
export const redeemToken = (
  pending: PendingConfirmations,
  token: string,
  intent: string,
): boolean => {
  if (pending.get(token) !== intent) return false;

  pending.delete(token);
  return true;
};
