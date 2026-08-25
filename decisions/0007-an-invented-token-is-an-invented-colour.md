# 0007. A token that no host sends is an invented colour

## Status

Accepted.

## Context

`render_view` asks the model to style its surface with the host's own CSS variables and never to write a colour of its own. `auditView` measures whether it did, by counting colour literals and counting references to host variables.

A real run broke the measurement rather than the rule. Asked to show bookings with confirmed ones in green, the model wrote:

```html
<span style="color: var(--color-success, green)">Confirmed</span>
```

There is no `--color-success` in the specification. The names are `--color-text-success` and `--color-background-success`, and a host sends only what the spec defines. So nothing arrived, the fallback painted, and the green on screen was the model's own choice.

The audit called it compliant. It matched any name shaped like `--color-*` and never asked whether that name exists, so a plausible token was indistinguishable from a real one. The model looked like it had followed the design system, the checker agreed, and the pixels disagreed with both.

That is worse than a violation the audit catches, because it is the failure mode a reader would never suspect: the surface cites the design system and does not use it.

## Decision

We will validate every referenced variable against the 76 keys the specification defines, treat any other `--*` reference as an invented colour regardless of its shape, and count a surface as compliant only when it uses at least one real token, invents none, and writes no literal colour outside a `var()` fallback.

## Consequences

Easier: the measurement now matches the thing being measured. A surface that cites a token nobody sends is reported as inventing a colour, which is what it is doing, and the tally names the invented token so the next reader can see the trick rather than the score.

Worse: the key list is a copy. It lives in `src/views.ts` and the specification lives in someone else's repository, so it can rot. A test pins the count at 76 and the record here says where the list came from, which is the cheapest guard available without generating the file at build time.

Also worse: this only catches invented *variables*. A model that writes `color: green` outside a fallback is caught by the literal check, but a model that names a real token and passes an absurd fallback is not, since a fallback is legitimate practice and we cannot tell intent from a value.

## Governance

`test/views.test.ts` asserts the list holds exactly 76 keys, that `--color-text-success` is in it and `--color-success` is not, and reproduces the real surface that caused this record. `npm run tally:views` prints invented tokens on their own line, so a run that scores well for the wrong reason is visible rather than silent.

## Notes

Bernardo, 25 August 2026. Found by booking a slot in Claude and asking for the confirmed one in green, which is the ordinary thing a person would ask for.

Rejected on the way: generating the key list from the installed SDK's type at build time, which removes the copy but adds a build step to a repository whose selling point is that it has none. Revisit if the list ever disagrees with a host in practice.
