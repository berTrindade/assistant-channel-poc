/**
 * The identity seam.
 *
 * Every tool resolves its caller through this one function. Today it ignores the
 * request and hands back a single shared demo account, which is what makes this a
 * preview rather than a pilot: everyone who connects sees, and mutates, the same
 * records.
 *
 * ponytail: one shared principal, swap the body for token verification when the
 * identity work lands. Nothing else in the server needs to change, because nothing
 * else reads the request.
 */

export type Principal = {
  id: string;
  displayName: string;
  /** Scopes the caller holds. Reads are ambient; each write names the scope it needs. */
  scopes: string[];
};

export const DEMO_PRINCIPAL: Principal = {
  id: 'demo-account',
  displayName: 'Demo account (shared)',
  scopes: ['account:read', 'booking:write'],
};

export const resolvePrincipal = (_authorizationHeader?: string): Principal => DEMO_PRINCIPAL;

export const hasScope = (principal: Principal, scope: string): boolean =>
  principal.scopes.includes(scope);
