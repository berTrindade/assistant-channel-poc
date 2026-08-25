# 0006. A refusal to save is not a tool failure

## Status

Accepted.

## Context

The confirmation gate from [0003](0003-server-issued-confirmation.md) refuses the first attempt at any write and hands back a question for the user. That refusal was returned like every other unhappy path in the server, through a helper that sets `isError: true`.

A real host showed what that costs. Clicking a Book button in Claude produced the expected sequence, `book_slot` declined, the model relayed the question, the user answered. But Claude rendered the declined call in red, labelled **Failed**, and then asked the user to confirm the change that had apparently just broken. The gate was working exactly as designed and the interface said the product was faulty.

Nothing in the specification predicts this, because `isError` is described in terms of the tool rather than the user. It means the call could not be completed. It says nothing about how a host will present that, and the sensible presentation of a failed call is an error.

The distinction the code was missing: a write that could not run and a write that declined to run are different outcomes. Only one of them is a fault.

## Decision

We will return the confirmation gate's refusals as ordinary results carrying the question, with `structuredContent: { saved: false }`, and reserve `isError` for calls that genuinely could not complete, such as a rule violation or an unknown slot.

## Consequences

Easier: the guarded write reads as a conversation rather than a fault. The host has nothing to paint red, the question arrives as a question, and the demo stops teaching viewers that confirmation means something went wrong.

Worse: the refusal now looks, to anything scanning for `isError`, like a success. Nothing in the transcript distinguishes "asked and waiting" from "saved" except the text and the structured flag, so a client that reads neither could believe the booking landed. That is the price of not lying about the failure, and `saved: false` is the smallest honest signal we can offer.

Also worse: two unhappy paths now sit in different shapes, so anyone adding a write tool has to decide which one applies. The rule is short enough to state, the tool ran and said no versus the tool could not run, but it is a decision rather than a default.

## Governance

`test/gate.test.ts` connects a client over the in-memory transport and asserts both halves: an unconfirmed booking is not flagged as an error and reports `saved: false`, and a booking against an unknown slot still is. If someone routes the gate back through `toolError`, the first test fails.

## Notes

Bernardo, 25 August 2026. Found by clicking a button on a surface the model had drawn, which is the only reason it surfaced at all: the same refusal read as unremarkable in a curl transcript.

Rejected on the way: keeping `isError` and adding a hint for hosts to treat confirmation specially, which invents a convention no host reads. Also rejected: suppressing the refusal and having the tool wait for elicitation everywhere, which does not survive a host that will not elicit.
