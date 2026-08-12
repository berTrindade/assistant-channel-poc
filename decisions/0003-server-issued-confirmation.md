# 0003. The confirmation is issued by the server, not claimed by the model

## Status

Accepted. Superseded in part by [0004](0004-self-contained-confirmation-token.md), which changes how the token is verified but not who issues it.

## Context

Writes in this shape land in real records through a user interface we do not own. The catalogue's position is that confirmation belongs in code rather than in the prompt, and the first implementation took that to mean a `confirm: boolean` argument on each write tool, described as "set to true only after the user has agreed".

A real host disproved it in under a minute. Told "Book slot-101", Claude called `book_slot` with `confirm: true` on the first attempt, reasoning that the instruction was itself the agreement. The booking landed with nothing asked and no opportunity to decline.

The model was not misbehaving. It was being helpful with a field that was offered to it. A flag the model controls is a flag the model will set.

## Decision

We will not accept any argument by which the model can assert that confirmation happened. The tools attempt host elicitation first, and where the host will not answer one, the server refuses the write and issues a token bound to that exact change. Only a token the server produced unlocks the write.

## Consequences

Easier: the two round trips are now structural. The model cannot collapse them, so the change is always stated before anything saves, and a token minted for a booking cannot be spent on a cancellation.

Worse: every write costs an extra round trip on hosts that will not elicit, and the refusal has to be phrased as an instruction to the model, which is a prompt in a place we said prompts do not belong.

The honest limit: this proves two round trips occurred, not that a human agreed. Only host-mediated elicitation proves the latter, because only the host can put the question somewhere the model cannot answer it. This is the best available where elicitation is unsupported, not an equivalent.

## Governance

Any write tool gaining a boolean, enum or free-text argument that the model can set to mean "the user agreed" is this decision being reversed. The test is whether a single tool call, composed entirely by the model, can cause a write.

## Notes

12 August 2026. The 2026-07-28 specification folds both mechanisms into an `input_required` result carrying opaque state that the client echoes back, which is this pattern as a first-class protocol feature. The SDK in use here is the 2025-era line and does not expose it yet.
