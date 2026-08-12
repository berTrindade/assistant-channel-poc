# 0004. Confirmation tokens carry their own proof

## Status

Accepted. Supersedes the storage half of [0003](0003-server-issued-confirmation.md).

## Context

[0003](0003-server-issued-confirmation.md) established that the server issues the confirmation token. The first implementation kept the valid ones in a `Map` on the process and deleted each on use, which gave single-use semantics and passed its tests.

It also reintroduced the exact thing the 2026-07-28 revision removed. That revision deleted protocol-level sessions so that any request can land on any instance; keeping token state in one process puts the instance affinity straight back. Behind two replicas, a token minted on A and presented to B is refused, and the user sees a booking fail for no reason they can act on. Sticky sessions or a shared cache would fix it by adding the infrastructure the protocol had just made unnecessary.

The protocol's own answer to continuity is an explicit handle that travels in the payload rather than state held server-side. The token should be that handle.

## Decision

We will encode the intent and the expiry in the token and sign it with a shared secret, so any instance can verify a token it did not issue. No confirmation state is stored anywhere. `CONFIRMATION_SECRET` is the only thing replicas must share.

## Consequences

Easier: any instance serves any request, which is what the stateless protocol was for. No store, no cache, no affinity, and no cleanup of abandoned tokens because expiry is carried in the token itself.

Worse: single use is gone. A token that can be verified without being remembered cannot be crossed off a list, so it is replayable until it expires, currently five minutes. That is tolerable only because the write path underneath is idempotent and contention-checked, so a replay books the slot once rather than twice. A future write that is not safe to repeat needs its own guard; it must not be given a different token.

Also worse: a leaked secret mints valid confirmations for any change. It is a deployment secret with the weight of one.

## Governance

Two signals of drift. Any module-level mutable collection appearing in the confirmation path means the store is back. And any write tool added without checking whether repeating it is safe means the replay trade has been inherited without being understood; the test named "a token can be replayed until it expires" exists to be read at that moment.

Revisit if the verifier stops being the issuer, at which point asymmetric signing replaces the shared secret.

## Notes

12 August 2026. Verified across two separate processes sharing only the secret: a token minted by one was accepted by the other, which had never seen it. Rejected on the way: a shared Redis for tokens, which works and reinstates the operational burden this revision exists to remove.
