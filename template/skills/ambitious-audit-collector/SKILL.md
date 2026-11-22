---
name: ambitious-audit-collector
description: For the Ambitious Bot only. Gather a collector document for ambitious-audit, writing every unseen value as null and saying what it could not see. Use when the Ambitious Bot collects an audit or a snapshot.
---

Template version: 0.4.9

# Audit collector

Build the JSON document that `ambitious-audit snapshot` stores. Use only the bot's own tools. Do not read another program's private files, and do not put a conversation transcript in any field.

Read the field lists and the allowed values:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide collector --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- A value no tool returned is `null`. Never write 0 for it, and never estimate.
- `account.kind` is `owner`, `guest` or `team` only when a tool reported the role or the account holder stated it. Otherwise write `unknown`; the audit still runs.
- Task counts come only from `ambitious-tasks counts`. A list that does not exist was not seen: its counts are `null`, never 0.
- `visibility` has exactly one entry for each signal, and every `null` needs its signal set to `seen: false`.
- Write the document to a file outside the bot's private data directory and pass it with `--in`.
