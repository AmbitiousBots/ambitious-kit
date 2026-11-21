---
name: ambitious-snapshot-routine
description: For the Ambitious Bot only. Audit daily; build review Pages weekly; send reports and compliance status on schedule. Use in the Ambitious Bot's ambitious-snapshot routine.
---

Template version: 0.4.5

# Snapshot routine

Runs daily. Create it active only when this bot's instructions allow an active snapshot; under older instructions create it paused. Until the owner has chosen monitoring and the required modules and matching skills are ready, do nothing and end with an empty reply.

Read:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide snapshot --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Sync, probe, collect and run `ambitious-audit` through `findings` and `recommend`; keep evidence locally. Write each high-priority `ruleId` to `high-priority.json` as a JSON list, then ask if the Page is due:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" review-page --json --in "${AMBITIOUS_HOME:-/workspace/ambitious}/high-priority.json"
```

`data.due` is true on the first run and 7+ days after the last build; never work it out yourself.

- Not due: build no Page or report; continue pending delivery per the guide, and reply only for changed failures, `data.newHighPriority` or something needing the owner.
- Due: build any report first, then `ambitious-audit-page` for its exact payload (or findings and recommendations without a report), and record with `review-page --built --json` only after the Page succeeds.

Hard rules:

- Build the report on the weekly run once the modules and the authenticated connection are ready. Send the exact module-built `data.payload`, and `send_compliance_status` when a compliance register exists (from `ambitious-compliance`). Under instructions version 12 or later send both in the background: no approval, preview or announcement. Under versions 6 to 11 the `guide snapshot` keeps the gates. A timeout is not receipt: retry with the same report identifier.
- Never put a password, API key, token or other secret in any payload; a payload may carry what the audit observed.
- Announcements come only from the saved `check_updates` result; never write your own. Version 12 needs no endpoint confirmation; versions 6 to 11 keep the `guide snapshot` confirmation gate.
- Keep files under `AMBITIOUS_HOME`, never under `/home/box/agent-data`. Never edit a pin or invent a priority, a number or a successful result.
