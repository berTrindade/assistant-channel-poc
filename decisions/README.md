# Decision log

The README says what this server does. These say why, and what each choice cost.

Every record here was earned. Each one exists because something was built, run against a real host, and found to be wrong in a way that was not obvious from the specification. That is the only reason a proof of concept is worth writing: to convert assumptions into evidence.

## The seven sections

| Section | What goes in it |
|---|---|
| Title | A short noun phrase naming the decision, numbered |
| Status | Proposed, Accepted, Superseded by NNNN, or Rejected |
| Context | The forces, in the present tense. What was true that made this a question |
| Decision | One sentence in the active voice. "We will..." |
| Consequences | Both directions. What gets easier, what gets worse, honestly |
| Governance | How anyone would know this decision is still being followed |
| Notes | Author, date, and what was rejected on the way |

## The log

| # | Decision | Status |
|---|---|---|
| [0001](0001-per-client-facade.md) | Assistant channel facades stay per client | Accepted |
| [0002](0002-two-entry-points.md) | Two entry points, stdio and HTTP | Accepted |
| [0003](0003-server-issued-confirmation.md) | The confirmation is issued by the server, not claimed by the model | Accepted |
| [0004](0004-self-contained-confirmation-token.md) | Confirmation tokens carry their own proof | Accepted, supersedes part of 0003 |
| [0005](0005-declare-the-card-twice.md) | Declare the card under both host conventions | Accepted |
| [0006](0006-refusing-is-not-failing.md) | A refusal to save is not a tool failure | Accepted |
| [0007](0007-an-invented-token-is-an-invented-colour.md) | A token that no host sends is an invented colour | Accepted |
