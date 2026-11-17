---
name: ambitious-scheduling-for-bots
description: For the Ambitious Bot only. Plan time with Ambitious Scheduling and check rule-bound decisions with Ambitious Constraints. Use when the Ambitious Bot is asked about calendars, working hours, schedules, calendar holds, or whether a plan can satisfy every rule.
---

Template version: 0.4.1

# Scheduling and constraints

Use `ambitious-scheduling` for calendars, working hours, busy time, schedule plans and calendar-hold proposals, and `ambitious-constraints` when a schedule or other decision must satisfy rules: `solve`, `explain` conflicts, `whatif`. Read how:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide scheduling --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Modules never call each other: carry data between them unchanged, only as `schedule-plan.v1`, `constraint-model.v1`, `constraint-solution.v1` and `calendar-holds.v1`.
- Commit a plan or a model only after the owner approves that exact proposal in this bot's own chat. Never work out times or totals yourself.
- A calendar hold is only a proposal shown in a Page. Create or change a real calendar event only with Grok Bot's own calendar tools, after the owner approves that exact change in this bot's own chat.
- Solving needs a pinned runtime the sync does not build: build it only on the owner's yes, as the guide says.
- Never place credentials in module input.
