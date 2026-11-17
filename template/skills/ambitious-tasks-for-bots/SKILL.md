---
name: ambitious-tasks-for-bots
description: For the Ambitious Bot only. Track shared work, dependencies and status with the Ambitious Tasks CLI. Use when the Ambitious Bot is asked to remember work, change a task, finish work, find what to do next, inspect a process or plan assignments.
---

Template version: 0.3.2

# Track work with Ambitious Tasks

Use the installed `ambitious-tasks` binary. `commands` lists the operations. Run `selfcheck` at routine start and resolve what `data.problems` reports before writing tasks.

Read how to add, change, finish, rank, count and schedule tasks:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide tasks --json
```

If it is missing or answers `E_USAGE`, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Never compute task counts, ranking, critical paths, workload totals, dates or process metrics by hand: use `counts`, `next`, `graph` and the process and schedule commands.
- Check `exists` in the `counts` output before reporting: when it is `false` the list does not exist and its counts are `null`, so do not report zero.
- Read the envelope after every command; never invent a result. Never place credentials or private bot files in task inputs.
