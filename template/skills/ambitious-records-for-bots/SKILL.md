---
name: ambitious-records-for-bots
description: For the Ambitious Bot only. Keep typed records that move through declared stages on the Ambitious service. Use when the Ambitious Bot is asked to track things of one kind with fixed fields, stages and rules for moving between stages.
---

Template version: 0.5.0

# Keep typed records

Records live in the owner's organization on the service. Use the Ambitious connection's record tools, such as `define_record_type`, `create_record`, `move_record` and `query_records`, only when this bot's instructions allow them (version 14 or later); otherwise call none and tell the owner.

Read which tool fits which request:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide records --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Agree the type with the owner before defining it.
- The service holds the record. Keep no copy in a module's database on this computer.
- Present counts and totals only as a tool returned them, and say when a result was cut off by `limit`.
- Never place credentials in record fields.
