---
name: ambitious-tasks-for-bots
description: For the Ambitious Bot only. Track work and when it is due, and repeatable work, on the Ambitious service. Use when the Ambitious Bot is asked to remember work, find what is due, report work done or run a repeatable process.
---

Template version: 0.6.0

# Track work

Work lives in the owner's organization on the service: work as facts, repeatable work as recipes and workflows. Use the Ambitious connection's tools, such as `upsert_facts`, `query_view`, `run_recipe` and `start_workflow_run`, only when this bot's instructions allow them (version 15 or later); otherwise call none and tell the owner.

Read how to keep, finish and run work:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide tasks --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- A fact is usable once written. Only a signed-in member of the owner's organization marks a fact verified, activates a draft recipe or answers a step that waits for a person, on the service's `/records` page; no tool does. Never say one happened unless a tool result shows it.
- A view returns the truth the service holds. Keep no second list on this computer, and never work out a date, a count or a ranking yourself.
- Claim a step before doing its work.
- Never place credentials in any field.
