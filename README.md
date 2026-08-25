# Assistant channel PoC

A working reference implementation of the **assistant channel** shape: an existing product exposed to an assistant somebody else runs, as a set of tools it can call. You own the contract and the writes. You do not own the model, the chat, or the rendering.

The shape, when to reach for it, and the six questions that disqualify most candidates are in [solution-catalogue](https://github.com/berTrindade/solution-catalogue/blob/main/types/assistant-channel.md). This repo is the part that has to actually run.

Why each choice was made, and what it cost, is in [decisions/](decisions/). Every record there exists because something was built, run against a real host, and found to be wrong in a way the specification did not predict.

## Demo

https://github.com/user-attachments/assets/11ef5754-0ab4-487e-b0de-80cd0f318932

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

## Two entry points

| Entry | Transport | Use when |
|---|---|---|
| `npm start` | Streamable HTTP on :3001 | A cloud host has to reach you, so you also need a tunnel or a deployment |
| `npm run start:stdio` | stdio | The host can spawn a process locally: no port, no tunnel, no public address |

The stdio route matters more than it looks. A cloud host needs a publicly reachable HTTPS address and, on a managed workspace, an administrator who has enabled custom connectors. A host that spawns a local process needs neither. Same tool contract either way, which is the point of keeping the contract separate from the transport.

## Using it in Claude Desktop

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` and restart Claude:

```json
{
  "mcpServers": {
    "assistant-channel-poc": {
      "command": "node",
      "args": ["/absolute/path/to/assistant-channel-poc/src/stdio.ts"]
    }
  }
}
```

Then quit Claude completely and reopen it; the config is only read at launch. The server appears under the "Add files, connectors, and more" control at the bottom-left of the composer, via Connectors, then Manage connectors.

No tunnel, and nothing for an administrator to have switched off.

If it does not appear, the logs say why:

```bash
tail -n 30 -f ~/Library/Logs/Claude/mcp*.log
```

`mcp-server-assistant-channel-poc.log` carries this server's stderr. The usual causes are a relative path in `args`, which must be absolute, and a `command` that is not on the app's PATH, which is why the config names the node binary in full.

## Using it in ChatGPT

ChatGPT cannot reach `localhost`, so the server needs a public HTTPS address:

```bash
npm start                 # terminal one
ngrok http 3001           # terminal two, copy the https URL
```

Then in ChatGPT: **Settings → Connectors → create a custom connector**, paste `https://<your-ngrok-host>/mcp`, set authentication to none, name it, save. Custom connectors need Plus, Pro, Team, Enterprise or Edu; Free cannot add them. On a Business or Enterprise workspace developer mode is off until an administrator enables it under Workspace Settings → Permissions & Roles → Connected Data.

Worth trying, in order:

1. "What appointment slots are available?" — plain text, no card
2. "Show my bookings" — the card
3. "Book slot-101" — the tool refuses, ChatGPT should tell you what it is about to do and ask; say yes and it books
4. "Book slot-101" again — replayed, nothing changes
5. "Who am I?" — the shared demo account, which is the point

Two things that will catch you out. A free ngrok URL changes every restart, so the connector points at a dead host and needs adding again. And ChatGPT snapshots what a connector can do when you first add it, so after changing tools you remove and re-add rather than toggling off and on.

### Why the card is registered twice

The two host families do not agree on how a tool declares a UI:

| | Tool metadata | Resource mimeType | Data reaches the card via |
|---|---|---|---|
| MCP Apps (Claude, Copilot, Goose) | `_meta.ui.resourceUri` | `text/html;profile=mcp-app` | a postMessage |
| OpenAI Apps SDK (ChatGPT) | `_meta["openai/outputTemplate"]` | `text/html+skybridge` | `window.openai.toolOutput` |

One HTML file, registered under two URIs, and `get_bookings` advertises both keys. Each host reads the one it knows and ignores the other. This is what a host-neutral tool contract actually costs today.

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
src/principal.ts    the identity seam: one function, currently a constant
src/rules.ts        the write rules: the only place determinism lives
src/confirm.ts      the confirmation gate: server-issued, single use
src/store.ts        channel state, in memory
src/tools.ts        the tool contract: declarations and plumbing, no decisions
src/server.ts       HTTP entry point
src/stdio.ts        stdio entry point
src/app/card.ts     the card, built against the ui/ dialect
src/app/card.html   generated by npm run build:card, committed, do not edit
test/               the checks that fail if the rules or the gate break
```

The card is a bundle, not a file you edit. `card.ts` and `card.css` are the source; `npm run build:card` inlines both into `card.html`, because a sandboxed iframe cannot fetch from another origin. The output is committed on purpose: hosts spawn `node src/stdio.ts` directly and never run an npm script, so an unbuilt card is a missing card.

If logic starts accumulating in `server.ts`, the shape has drifted. Decisions belong in `rules.ts`, which is why that is the file with tests and the only one that knows nothing about MCP.

## Three things worth reading the code for

**The confirmation is issued by the server, not claimed by the model.** The first version of this took a `confirm: boolean` argument. A real host broke it in under a minute: told "Book slot-101", the model set `confirm` to true on the first call, reasoning that the instruction was itself the agreement, and the booking landed with nothing asked.

So the gate moved. `book_slot` tries host elicitation first, and where the host will not answer one, it refuses and hands back a signed token bound to that exact change. The model cannot forge one, so it cannot collapse the two turns into one.

The token carries its own proof rather than being looked up: the change and the expiry are encoded in it and signed, so any instance can verify a token it did not issue. The first attempt at this kept valid tokens in a `Map`, which worked on one process and would have failed behind a load balancer, reintroducing exactly the instance affinity the stateless protocol removed. Set `CONFIRMATION_SECRET` so every replica shares it.

What that buys: the change is stated before anything saves, and a token minted for a booking cannot be spent on a cancellation. What it does not buy: proof a human said yes, which only host elicitation gives you, and single use, since a self-contained token can be replayed until it expires. The write path underneath is idempotent and contention-checked, so a replay books the slot once. See `confirm.ts`.

**Identity is one function.** `resolvePrincipal` ignores the request and returns a shared demo account. That single fact is what makes this a preview and not a pilot: everyone who connects sees and mutates the same records. Swapping the body for token verification is the whole change; nothing else in the server reads the request.

**Tool annotations are hints, not controls.** `book_slot` carries `idempotentHint`, and `cancel_booking` carries `destructiveHint`. Clients are required to treat annotations from untrusted servers as untrusted, so they inform display, never safety. The actual guarantees are enforced in `rules.ts` and tested.

## What this is not

- **Not authenticated.** One shared principal, no OAuth. Every connection is the same account.
- **Not durable.** State is in memory and dies with the process.
- **Not a product integration.** The store stands in for the real APIs a facade would call.
- **The card is read-only.** It renders what `get_bookings` returns and does not call tools back, though the `App` class it uses supports that.

Each of those is a deliberate shortcut with a named ceiling, marked with a `ponytail:` comment where it lives in the code.
