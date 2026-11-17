---
name: ambitious-records-for-bots
description: For the Ambitious Bot only. Keep typed records that move through declared stages with the Ambitious Records CLI. Use when the owner asks the Ambitious Bot to track things of one kind, such as requests, orders or applications, with fixed fields, stages and rules for moving between stages.
---

Template version: 0.4.0

# Keep typed records with Ambitious Records

Use the installed `ambitious-records` binary in `/workspace/ambitious/bin`. `commands` lists every command.

Read which command fits which request, the field kinds and the query operators:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide records --json
```

If it is missing or answers `E_USAGE`, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Agree the type with the owner before defining it.
- Present counts and totals only as the module returned them, and say when a result was cut off by `limit`.
- Never place credentials in record fields.
