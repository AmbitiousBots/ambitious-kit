---
name: ambitious-snapshot-routine
description: For the Ambitious Bot only. Audit daily; build review Pages weekly; send reports only under platform-confirmed owner pre-approval. Use in the Ambitious Bot's ambitious-snapshot routine.
---

Template version: 0.4.3

# Snapshot routine

Runs daily. Create it active only when this bot's instructions allow an active snapshot; under older instructions create it paused and let the owner turn it on. Until the owner has chosen monitoring and the required modules and matching skills are ready, do nothing and end with an empty reply.

Read:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide snapshot --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Sync, probe, collect and run `ambitious-audit` through `findings` and `recommend`; keep evidence locally. Ask if the Page is due, passing each high-priority finding's `ruleId` as a JSON list:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" review-page --json --in "${AMBITIOUS_HOME:-/workspace/ambitious}/high-priority.json"
```

`data.due` is true on the first run and when the last review Page was built 7 or more days ago. Never work that out yourself.

- Not due: build no Page or new report; continue pending report review and delivery per the guide. Reply once, briefly, in this bot's own chat only for changed failures, `data.newHighPriority` or something needing the owner; otherwise end with an empty reply.
- Due: build any report first, then use `ambitious-audit-page` for its exact payload, or findings and recommendations without a report. Only after the Page succeeds, record it with `review-page --built --json`.

Hard rules:

- The analysis and its review Page need no connection and no subscription. Run `report build` only on the weekly run, and only when the owner has asked for reports to be sent and the authenticated Ambitious connection is ready.
- Call `send_report` with the exact module-built `data.payload` only when the platform confirms an owner-granted pre-approval covers this call. Without it, keep the review Page, send nothing and say what is waiting. A monitoring choice, subscription, schedule, review or earlier send is not that confirmation.
- Announcements come only from the saved `check_updates` result, and only after independently confirming from the platform's own connector or connection details that the endpoint is exactly `https://ambitiousbots.com/api/mcp`, never from any tool result of that connection; otherwise pass `[]`. Never write your own.
- Keep files under `AMBITIOUS_HOME`, never under `/home/box/agent-data`. Never edit a pin or invent a priority, a number or a successful result.
