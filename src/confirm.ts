/**
 * The confirmation gate.
 *
 * Two mistakes led here, and both are worth keeping written down.
 *
 * The first version took a `confirm: boolean` argument. A real host broke it in under a
 * minute: told "Book slot-101", the model set confirm to true on the first call,
 * reasoning that the instruction was itself the agreement, and the booking landed with
 * nothing asked. A flag the model controls is a flag the model will set.
 *
 * The second version issued a server-side token and kept the valid ones in a Map. That
 * fixed the forgery and quietly reintroduced exactly what the stateless protocol had
 * just removed: a request that only one instance can serve. Behind two replicas, a token
 * minted on A and presented to B is refused for no reason the user can see.
 *
 * So the ticket now carries its own proof. The intent and the expiry are encoded in the
 * token and signed, so any instance can verify one without having been the instance that
 * issued it. Nothing is remembered anywhere. That is the same shape the spec's
 * multi-round-trip requests use, where the server returns opaque state and the client
 * echoes it back on the retry.
 *
 * The trade: a signed token can be replayed until it expires, where a Map entry could be
 * deleted on use. That is acceptable here because the write path underneath is already
 * idempotent and contention-checked, so a replay books the same slot once rather than
 * twice. If a future write is not safe to repeat, it needs its own guard, not a
 * different token.
 *
 * ponytail: HMAC with a shared secret, five minute life. Good enough while every replica
 * can hold the same secret. Asymmetric signing only if the verifier stops being the
 * issuer.
 */

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const DEFAULT_TTL_MS = 5 * 60_000;

/**
 * A random per-process secret is a development convenience and nothing more: it works on
 * one instance and fails across replicas in precisely the way this file exists to avoid.
 * Set CONFIRMATION_SECRET anywhere it matters.
 */
export const confirmationSecret = (): string =>
  process.env.CONFIRMATION_SECRET ?? randomUUID();

/**
 * An intent key names the exact change being confirmed. Two different changes never
 * share one, which is what stops a token being redeemed against something else.
 */
export const intentKey = (tool: string, args: Record<string, unknown>): string =>
  `${tool}:${JSON.stringify(args, Object.keys(args).sort())}`;

const sign = (secret: string, payload: string): string =>
  createHmac('sha256', secret).update(payload).digest('base64url');

const matches = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export const issueToken = (
  secret: string,
  intent: string,
  now: number,
  ttlMs: number = DEFAULT_TTL_MS,
): string => {
  const payload = Buffer.from(JSON.stringify({ intent, exp: now + ttlMs })).toString('base64url');
  return `${payload}.${sign(secret, payload)}`;
};

/**
 * Verify a token against the change being attempted. Returns false for anything that is
 * not a token this secret issued, for this exact change, still inside its life.
 */
export const redeemToken = (
  secret: string,
  token: string,
  intent: string,
  now: number,
): boolean => {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  if (!matches(sign(secret, payload), signature)) return false;

  try {
    const claim = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      intent?: unknown;
      exp?: unknown;
    };
    return claim.intent === intent && typeof claim.exp === 'number' && claim.exp > now;
  } catch {
    return false;
  }
};
