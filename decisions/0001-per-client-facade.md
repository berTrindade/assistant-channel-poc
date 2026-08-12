# 0001. Assistant channel facades stay per client

## Status

Accepted.

## Context

The assistant channel shape fits several clients at once rather than one. When a shape repeats, the reflex is to build it once as a multi-tenant service pointed at each client's APIs. That would give one deployment, one upgrade path when the protocol revises, and one place to fix a bug.

Three facts push the other way. The data, the estate and the identity provider belong to the client, so a shared runtime would sit inside someone else's trust boundary holding tokens for all of them. The shape is cheap precisely because the facade mounts inside the client's existing service and reaches its APIs locally. And no two clients have asked for the same thing yet; the repetition so far is ours, not theirs.

## Decision

We will implement each assistant channel as a facade mounted inside that client's own estate. We will not run a shared multi-tenant gateway. The only thing that crosses engagements is a card primitives library, consumed as a dependency and themed per client.

## Consequences

Easier: no cross-client blast radius, no credentials for client systems held by us, no tenancy model to design, and each client's security review covers only their own deployment.

Worse: the protocol revises and we upgrade N codebases rather than one. Bug fixes are copied rather than deployed. There is no shared telemetry across engagements, so we learn slower than a single service would allow.

Accepted because the coupling a shared gateway creates is harder to unwind than the duplication it removes, and because a shared runtime can be built later from working facades, whereas facades cannot be extracted from a gateway once clients depend on it.

## Governance

Two signals that this has drifted: a repository appears holding more than one client's tool contract, or the card primitives library gains anything that reads client data rather than rendering what it is handed. Either means the gateway is being built by accident.

Revisit when two clients independently ask for the same tool surface, which is the condition that makes a shared runtime a response to demand rather than to our own repetition.

## Notes

12 August 2026. Rejected on the way: a shared gateway with per-client credential isolation, which solves the token problem but neither the trust-boundary nor the local-API one.
