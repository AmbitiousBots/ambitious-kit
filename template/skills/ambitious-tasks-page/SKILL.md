---
name: ambitious-tasks-page
description: For the Ambitious Bot only. Present what is due and what waits for a person, from the Ambitious service, in a Grok Bot Page. Use when the Ambitious Bot is asked for a readable work board or a summary of what is due.
---

Template version: 0.5.0

# Present work as a Page

The bot renders the Grok Bot Page from what the Ambitious connection's tools return; the service writes no Pages. Call `whats_due`, `list_commitments` and `list_workflow_runs` only when this bot's instructions allow them (version 14 or later); otherwise call none and tell the owner.

Read the layout under "Present work as a Page":

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide tasks --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Show due items in the order returned, each as returned. Never count, total, date or rank anything yourself.
- Show a proposed commitment, and work reported but not accepted, under "Waiting for a person", decided on the service's `/records` page; never as active or done.
- State the days looked ahead and when the tools were called. If a call fails, report its error and publish no stale data as current.
