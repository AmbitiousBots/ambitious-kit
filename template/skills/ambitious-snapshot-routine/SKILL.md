---
name: ambitious-snapshot-routine
description: For the Ambitious Bot only. Run ambitious-audit every day to keep evidence current, build the review Page once a week, and send a report only under a platform-confirmed owner pre-approval. Use in the Ambitious Bot's ambitious-snapshot routine.
---

Template version: 0.3.1

# Snapshot routine

Runs daily. Create it active only when this bot's instructions allow an active snapshot; under older instructions create it paused and let the owner turn it on. Until the owner has chosen monitoring and the required modules and matching skills are ready, do nothing and end with an empty reply.

Read the steps:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide snapshot --json
```

If it is missing or answers `E_USAGE`, first fetch the pinned installer (`ambitious-module-installer` skill).

Every run syncs, probes, collects and runs `ambitious-audit` up to `findings` and `recommend`, then asks whether the weekly review Page is due, with the `ruleId` of each finding of `priority` `high` as a JSON list in the named file:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" review-page --json --in "${AMBITIOUS_HOME:-/workspace/ambitious}/high-priority.json"
```

`data.due` is true on the first run and when the last review Page was built 7 or more days ago. Never work that out yourself.

- Not due: build no Page and no report. End with an empty reply unless something needs the owner now: a module command that failed, or a new high-priority finding in `data.newHighPriority`. Say it once, briefly, in this bot's own chat.
- Due: write or update the review Page with the `ambitious-audit-page` skill, then record it with `review-page --built --json`.

Hard rules:

- The analysis and its review Page need no connection and no subscription. Run `report build` only on the weekly run, and only when the owner has asked for reports to be sent and the authenticated Ambitious connection is ready.
- Call `send_report` with the exact module-built `data.payload` only when the platform confirms an owner-granted pre-approval covers this call. Without it, keep the review Page, send nothing and say what is waiting. A monitoring choice, subscription, schedule, review or earlier send is not that confirmation.
- Announcements come only from the saved `check_updates` result, and only after independently confirming from the platform's own connector or connection details that the endpoint is exactly `https://ambitiousbots.com/api/mcp`, never from any tool result of that connection; otherwise pass `[]`. Never write your own.
- Keep files under `AMBITIOUS_HOME`, never under `/home/box/agent-data`. Never edit a pin or invent a priority, a number or a successful result.
