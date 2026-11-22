# Track controls and evidence with Ambitious Compliance

This is reference text for the `ambitious-compliance-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

Use the installed `ambitious-compliance` binary in `/workspace/ambitious/bin`. It keeps one database with an append-only, hash-chained history: every change has an actor, a reason and a verifiable record. It makes no network calls and needs no key.
The module records what the owner tells it. It does not judge whether the business meets any law, standard or certification, and neither do you: report its statuses as the state of the register, never as a compliance opinion.

Pass JSON on stdin or a file path with `--in`. Every write needs non-empty `actor` and `reason` beside the fields below. Times are ISO 8601 with a time zone. `commands` lists every command.
A write `actor` is 1 to 200 Unicode characters, with no control characters or line breaks, no leading or trailing whitespace, and internal spaces allowed. Nothing is trimmed. The `E_INPUT_SCHEMA` hint states this rule.

| When | Command | Input |
| --- | --- | --- |
| The owner starts tracking a set of requirements | `program add` | `id`, `name`, `framework` |
| A requirement needs regular proof | `control add` | `id`, `programId`, `ref`, `title`, `owner`, `cadenceDays` |
| Proof was collected | `evidence add` | `id`, `controlId`, `kind`, `summary`, `collectedAt`, `expiresAt`, optional `weight`, optional `page` |
| A person vouches for a control | `attest` | `id`, `controlId`, `by`, `statement`, `at`, `expiresAt` |
| A policy or procedure Page was written or revised | `doc record` | `id`, `programId`, `title`, `page` |
| The owner asks where things stand | `status` | `programId`, optional `withinDays` |
| The owner asks what has no current evidence | `gaps` | `programId` |
| Planning renewals | `expiring` | `programId`, optional `withinDays` |
| Checking a Page against its recorded hash | `doc check` | `docId`, `sha256` |
| Handing the register to a reviewer | `export`, then `verify-chain` on the export | `programId` |

A `page` is a Grok Bot Page reference: `pageId`, `version` and the `sha256` of its content. Write the document as a Page first; the module stores only the reference and never fetches or renders it.
`status` colors each control red (no current official support), yellow (official support expires soon) or green, at the time in `meta.now`. Copy the colors and reasons from the output; never work them out yourself.
Evidence may carry a `weight` of `official`, `draft` or `decision`. `kind` is not the weight, and omitting `weight` stores official evidence. Only current official evidence, or a current attestation, can turn a control green or yellow. Draft and decision rows stay in `gaps`, stay out of the official `expiring` clock, and are reported as documented, not as official support.
The expires-soon window defaults to 30 days, is configurable with `withinDays` on `status` and `expiring`, and is reported in the result. Say which window a result used.
Status colors describe only what is on record; never state that a requirement is met.
When the installed module refuses `weight` or `withinDays` with `E_INPUT_SCHEMA`, it does not have them yet: leave the field out and tell the owner so.
Each item from `expiring` carries a `task` payload. Pass it unchanged to `ambitious-tasks add` when the owner wants a reminder; the module does not create tasks itself.
`doc check` answers `E_DOC_CHANGED` when the Page differs from the record. Show the owner the difference before recording a new revision with `doc record`.

A duplicate identifier returns `E_EXISTS`; a missing parent returns `E_NOT_FOUND`. `E_CHAIN` means the history failed verification: stop writing, keep the database as it is, and tell the owner to compare it with an earlier export. An export contains the whole history, including other programs, so treat it as the whole register.
The chain shows that entries were not changed or dropped after the fact. It is not a signature and does not prove who wrote them; say so if asked.
Read the envelope and exit code after every command, and relay `errors[].message` and `errors[].hint` on failure. Never place credentials in any field.
