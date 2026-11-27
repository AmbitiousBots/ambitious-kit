---
name: ambitious-records-for-bots
description: For the Ambitious Bot only. Keep records as facts on the Ambitious service. Use when the Ambitious Bot is asked to track things of one kind with fixed fields and stages.
---

Template version: 0.6.0

# Keep records as facts

A record is a subject and the facts about it, in the owner's organization on the service. Use the Ambitious connection's tools, such as `upsert_facts`, `list_facts`, `define_view` and `query_view`, only when this bot's instructions allow them (version 15 or later); otherwise call none and tell the owner.

Read which tool fits which request:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide records --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Agree the kind and its keys with the owner before the first write.
- A fact is usable once written. Only a signed-in member of the owner's organization marks one verified, on the service's `/records` page; no tool does. Never say one is unless a tool result shows it.
- The service holds the record. Keep no copy in a module's database on this computer.
- Present counts and totals only as a tool returned them, and say when `limit` may have cut a list off.
- Never place credentials in a fact.
