---
name: ambitious-compliance-for-bots
description: For the Ambitious Bot only. Keep a register of controls, evidence and attestations with the Ambitious Compliance CLI. Use when the owner asks the Ambitious Bot to track what a program requires, record proof that it was done, see what is missing or about to expire, or check that a recorded document has not changed.
---

Template version: 0.2.2

# Track controls and evidence with Ambitious Compliance

Use the installed `ambitious-compliance` binary in `/workspace/ambitious/bin`. It keeps one database with an append-only, hash-chained history: every change has an actor, a reason and a verifiable record. It makes no network calls and needs no key.
The module records what the owner tells it. It does not judge whether the business meets any law, standard or certification, and neither do you: report its statuses as the state of the register, never as a compliance opinion.

Pass JSON on stdin or a file path with `--in`. Every write needs non-empty `actor` and `reason` beside the fields below. Times are ISO 8601 with a time zone. `commands` lists every command.

| When | Command | Input |
| --- | --- | --- |
| The owner starts tracking a set of requirements | `program add` | `id`, `name`, `framework` |
| A requirement needs regular proof | `control add` | `id`, `programId`, `ref`, `title`, `owner`, `cadenceDays` |
| Proof was collected | `evidence add` | `id`, `controlId`, `kind`, `summary`, `collectedAt`, `expiresAt`, optional `page` |
| A person vouches for a control | `attest` | `id`, `controlId`, `by`, `statement`, `at`, `expiresAt` |
| A policy or procedure Page was written or revised | `doc record` | `id`, `programId`, `title`, `page` |
| The owner asks where things stand | `status` | `programId` |
| The owner asks what has no current evidence | `gaps` | `programId` |
| Planning renewals | `expiring` | `programId`, `withinDays` |
| Checking a Page against its recorded hash | `doc check` | `docId`, `sha256` |
| Handing the register to a reviewer | `export`, then `verify-chain` on the export | `programId` |

A `page` is a Grok Bot Page reference: `pageId`, `version` and the `sha256` of its content. Write the document as a Page first; the module stores only the reference and never fetches or renders it.
`status` colors each control red (no current support), yellow (support expires soon) or green, at the time in `meta.now`. Copy the colors and reasons from the output; never work them out yourself.
Each item from `expiring` carries a `task` payload. Pass it unchanged to `ambitious-tasks add` when the owner wants a reminder; the module does not create tasks itself.
`doc check` answers `E_DOC_CHANGED` when the Page differs from the record. Show the owner the difference before recording a new revision with `doc record`.

A duplicate identifier returns `E_EXISTS`; a missing parent returns `E_NOT_FOUND`. `E_CHAIN` means the history failed verification: stop writing, keep the database as it is, and tell the owner to compare it with an earlier export. An export contains the whole history, including other programs, so treat it as the whole register.
The chain shows that entries were not changed or dropped after the fact. It is not a signature and does not prove who wrote them; say so if asked.
Read the envelope and exit code after every command, and relay `errors[].message` and `errors[].hint` on failure. Never place credentials in any field.
