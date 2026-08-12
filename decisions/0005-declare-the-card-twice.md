# 0005. Declare the card under both host conventions

## Status

Accepted.

## Context

The shape claims the tool contract is host-neutral, so which assistant renders it is a deployment choice. Cards are where that claim meets resistance.

The two host families do not agree on how a tool declares a UI:

| | Tool metadata | Resource mimeType | How data reaches the card |
|---|---|---|---|
| MCP Apps (Claude, Copilot, Goose) | `_meta.ui.resourceUri` | `text/html;profile=mcp-app` | a postMessage handshake |
| OpenAI Apps SDK (ChatGPT) | `_meta["openai/outputTemplate"]` | `text/html+skybridge` | `window.openai.toolOutput` |

The card was first built for the MCP Apps convention only, with a hand-rolled postMessage listener rather than the SDK's `App` class. In Claude it produced an iframe that rendered nothing: the host created the frame and the contents stayed blank, because the `ui/` dialect is a JSON-RPC protocol with a handshake rather than a message shape that can be inferred.

## Decision

We will keep one card source and register it under both conventions, with the tool advertising both metadata keys. The card is built against the SDK's `App` class rather than a hand-written bridge, and reads whichever data channel arrives.

## Consequences

Easier: the same server renders in either host family with no branching, which is the host-neutrality claim actually holding rather than being asserted.

Worse: one card, two URIs and two registrations, which reads as duplication to anyone who does not know why. The `App` class also brings the client machinery with it, so the bundle is around 386kB inlined, heavy for a chat card. And the card now needs a build step whose output must be committed, because hosts spawn the server directly and never run an npm script.

## Governance

If a second card appears and only one convention is registered for it, this decision has been forgotten. The check when adding any card is that both `_meta` keys and both resources exist for it.

Delete one half the day the conventions converge, which is the outcome to hope for rather than to design around.

## Notes

12 August 2026. Verified that both resources serve and both metadata keys appear in `tools/list`. Not yet verified that either paints in a live host, which is the outstanding item on this record.
