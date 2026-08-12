# 0002. Two entry points, stdio and HTTP

## Status

Accepted.

## Context

The server started with one entry point, Streamable HTTP, because that is what a cloud-hosted assistant needs to reach. Demonstrating it therefore needed a public HTTPS address, which meant a tunnel, and on a managed workspace it also needed an administrator to have enabled custom connectors.

Both walls turned up in the same afternoon. ChatGPT on a Business workspace reported "your administrator has not enabled developer mode", greyed out and not self-serviceable. Claude's web connector list offered only its pre-built connectors, with no way to add a custom one. The same account could reach neither, on either surface.

A host that spawns the server as a child process needs none of that. No port, no public address, no tunnel, and nothing for an administrator to have switched off.

## Decision

We will ship both entry points over one tool contract. `src/server.ts` speaks Streamable HTTP for hosts that must reach us over a network. `src/stdio.ts` speaks stdio for hosts that can spawn a process. `src/tools.ts` holds the contract and neither entry point holds a decision.

## Consequences

Easier: the PoC is demonstrable on a locked-down corporate account, which is the only kind of account most reviewers have. Swapping transport becomes a deployment choice rather than a rewrite, which is the host-neutrality claim made concrete.

Worse: two code paths to keep working, and only one is exercised at a time, so the unused one rots quietly. The stdio path also cannot carry a user identity at all: the process runs as whoever launched it, so a stdio deployment can never become a pilot. The easiest thing to demonstrate is the thing that can never ship.

## Governance

If anything transport-specific appears in `tools.ts`, the split has failed. The check is that both entry points remain short enough to read in one screen and contain no branching on which one is running.

## Notes

12 August 2026. The specification agrees on the identity point independently: stdio implementations SHOULD NOT use the OAuth flow and should take credentials from the environment.
