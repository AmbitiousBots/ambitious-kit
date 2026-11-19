---
name: ambitious-scheduling-for-bots
description: For the Ambitious Bot only. Plan time with Ambitious Scheduling and check rule-bound decisions with Ambitious Constraints. Use when the Ambitious Bot is asked about calendars, working hours, schedules, calendar holds, or whether a plan can satisfy every rule.
---

Template version: 0.4.3

# Scheduling and constraints

Use `ambitious-scheduling` for calendars, working hours, busy time, schedule plans and calendar-hold proposals, and `ambitious-constraints` when a schedule or other decision must satisfy rules: `solve`, `explain` conflicts, `whatif`:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide scheduling --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Modules never call each other: carry data between them unchanged, only as `tasks-snapshot.v1`, `schedule-plan.v1`, `constraint-model.v1`, `constraint-solution.v1` and `calendar-holds.v1`.
- Commit a plan or model only after the owner approves that exact proposal in this bot's own chat. Never work out times or totals yourself.
- A calendar hold is only a proposal shown in a Page; the owner applies it. Never create, change or cancel a real calendar event.
- Solving needs a pinned runtime the sync does not build. Build it only when the owner asks for solving in this bot's own chat and this bot's instructions allow that download; else say so.
- Never place credentials in module input.
