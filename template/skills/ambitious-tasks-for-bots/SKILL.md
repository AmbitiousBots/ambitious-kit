---
name: ambitious-tasks-for-bots
description: For the Ambitious Bot only. Track what is owed and when, and repeatable work, on the Ambitious service. Use when the Ambitious Bot is asked to remember work, find what is due, report work done or run a repeatable process.
---

Template version: 0.5.0

# Track work

Work lives in the owner's organization on the service: commitments (who owes what, and when) and workflows with their runs. Use the Ambitious connection's tools, such as `propose_commitment`, `whats_due`, `complete_obligation` and `start_workflow_run`, only when this bot's instructions allow them (version 14 or later); otherwise call none and tell the owner.

Read how to propose, read, finish and run work:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide tasks --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- You propose; people decide. A member of the owner's organization activates a proposed commitment and accepts reported work on the service's `/records` page; no tool does. Say what waits there; never say it happened unless a tool result shows it.
- `whats_due` and `list_commitments` return the truth the service holds. Keep no second list on this computer, and never work out a date, a count or a ranking yourself.
- Claim a workflow step before doing its work.
- Never place credentials in any field.
