# Assistant channel PoC

A working reference implementation of the **assistant channel** shape: an existing product exposed to an assistant somebody else runs, as a set of tools it can call. You own the contract and the writes. You do not own the model, the chat, or the rendering.

The shape, when to reach for it, and the six questions that disqualify most candidates are in [solution-catalogue](https://github.com/berTrindade/solution-catalogue/blob/main/types/assistant-channel.md). This repo is the part that has to actually run.

## Why this exists

The catalogue's proof for this shape is a preview whose only guarded write is a monotonic reading, which is the easiest guarded write there is: one user, one direction, no contention. It proves the shape but leaves the hard half untested.

This PoC covers the hard half. Booking a slot is **contended** (two callers reach for the last place), **confirmed** (nothing saves without a human answering), and **idempotent** (a retried call does not book twice). Those three properties are the reason the write rules are your code rather than the model's judgement.

## Running it

```bash
npm install
npm test          # the write rules, six assertions, no framework
npm start         # http://localhost:3001/mcp
```

Node 22.6+ only. TypeScript runs directly via native type stripping, so there is no build step and no `dist/`.

Point a host at `http://localhost:3001/mcp` as an MCP server with no authentication, or drive it with curl:

```bash
curl -s -X POST http://localhost:3001/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_slots","arguments":{}}}'
```

## The tools

| Tool | Reads or writes | What it demonstrates |
|---|---|---|
| `whoami` | read | The identity seam, and that this preview shares one account |
| `list_slots` | read | Plain structured output, no card |
| `get_bookings` | read | A card view, via a `ui://` MCP Apps resource |
| `book_slot` | write | Confirmation, contention, idempotency |
| `cancel_booking` | write | Idempotent undo, and not leaking other people's booking ids |

## What each file is for

```
src/principal.ts   the identity seam: one function, currently a constant
src/rules.ts       the write rules: the only place determinism lives
src/store.ts       channel state, in memory
src/server.ts      the tool contract: declarations and plumbing, no decisions
src/app/card.html  one card view
test/rules.test.ts the checks that fail if the rules break
```

If logic starts accumulating in `server.ts`, the shape has drifted. Decisions belong in `rules.ts`, which is why that is the file with tests and the only one that knows nothing about MCP.

## Three things worth reading the code for

**Confirmation refuses rather than degrades.** `book_slot` asks the host to confirm via elicitation. A host that does not support elicitation gets a refusal and an explanation, not a silent write. That is deliberate: a confirmation you skip when it is inconvenient is not a confirmation. The 2026-07-28 spec adds an `input_required` tool result that does this without the extra round trip, and when the SDK exposes it, `confirmed()` in `server.ts` is the only thing that changes.

**Identity is one function.** `resolvePrincipal` ignores the request and returns a shared demo account. That single fact is what makes this a preview and not a pilot: everyone who connects sees and mutates the same records. Swapping the body for token verification is the whole change; nothing else in the server reads the request.

**Tool annotations are hints, not controls.** `book_slot` carries `idempotentHint`, and `cancel_booking` carries `destructiveHint`. Clients are required to treat annotations from untrusted servers as untrusted, so they inform display, never safety. The actual guarantees are enforced in `rules.ts` and tested.

## What this is not

- **Not authenticated.** One shared principal, no OAuth. Every connection is the same account.
- **Not durable.** State is in memory and dies with the process.
- **Not a product integration.** The store stands in for the real APIs a facade would call.
- **The card is unverified.** The server side is exercised end to end; `card.html` hand-rolls a small postMessage bridge and has not been opened in a live host. Swap it for the `@modelcontextprotocol/ext-apps` `App` class the moment the card needs to call tools back.

Each of those is a deliberate shortcut with a named ceiling, marked with a `ponytail:` comment where it lives in the code.
