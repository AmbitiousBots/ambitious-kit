# Track work with Ambitious Tasks

This is reference text for the `ambitious-tasks-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

Use the installed `ambitious-tasks` binary. Run `selfcheck` at routine start and read `data.problems`; resolve a reported problem before writing tasks. `commands` lists the available operations. Every input shape and the meaning of estimates and schedules are documented at https://github.com/AmbitiousBots/ambitious-tasks#readme; that documentation is not a file on this computer.

Create a task with `add` when there is a concrete outcome to track. Include a useful title and `done_when`. Link prerequisites with `depends_on` or `dep add`; never describe an unrecorded dependency as enforced. Use `get` or `list` before editing existing work. Change details with `update`, state with `status`, and prerequisites with `dep add` or `dep rm`.

Move a task to another list with `list move`, input `{id, list, idem_key?, actor?}`: the task keeps its id and the move is recorded in its history. `update` with `patch.list` remains valid. When the installed module answers `list move` with `E_USAGE`, it does not have the command yet: use `update` with `patch.list`.

Always pass an `idem_key` for a write. Choose one stable key per intended action and keep both the key and input unchanged for a retry. Use a new key for a new action. If a call fails with `E_IDEMPOTENCY`, inspect the original action instead of changing its payload under the same key. Do not repeat a timed-out write with a new key before checking whether the original succeeded.
A write `actor` is 1 to 200 Unicode characters, with no control characters or line breaks, no leading or trailing whitespace, and internal spaces allowed. Nothing is trimmed. The `E_INPUT_SCHEMA` hint states this rule.

Finish a task only after its acceptance evidence is available. Record a short status note with that evidence. A done task reopens only with `status` and `reopen:true`, targeting `todo`; do not try to bypass that rule through update or import. Reopening is a deliberate user-visible action.

Ask `next` when choosing work. For each task it returns the display fields `board` returns, among them `assignee`, `due` and `priority`, with a field that has no value present as `null`, plus `score` and `reasons`. When the installed module returns fewer fields, read the rest with `get`; never guess them. Relay its reasons, including any `needs approval` reason and approval label. Being ranked does not grant approval. A task is ready only when all its prerequisites are done. If a prerequisite was canceled, resolve the dependency explicitly.

Never compute task counts, ranking, critical paths, workload totals, dates or process metrics by hand. Use `counts` for how many tasks are open, stale for 7 or more days, blocked, waiting or finished in the last 7 days, and report its `asOf` time and its `list` with the numbers. Pass the list name; without one, `counts` reports the list named `default`, where tasks added without a list go. Check `exists` before reporting: when it is `false` no task has ever been in that list and the counts are `null`, so do not report zero or an empty board. Relay the `note`, which names the lists that do exist, and ask which one was meant. Use `graph`, `process metrics`, `process simulate`, `schedule suggest` and `schedule check` for the rest. Copy the time and seed from `meta` when reproducing a result. State that simulation and schedule dates are estimates under their documented assumptions.

Schedule suggestions are read-only. Pass the same people to the independent schedule checker. Explain any violations before proposing assignment changes, then use `update` for task assignees when authorized. Do not present a suggestion as a committed schedule.

## A minimal schedule sketch: one person, weekday hours, 14 days

`schedule suggest` requires `horizon_days`, a number from 0 to 36600, and takes the people in the request body. A person is `id`, `capacity_days_per_week` and `windows`; a window is a `start` and an `end` instant with a time zone. Suggestions do not persist people: send the roster again with every call.

```json
{"horizon_days":14,"people":[{"id":"desk-1","capacity_days_per_week":5,"windows":[{"start":"2026-05-04T09:00:00+02:00","end":"2026-05-18T09:00:00+02:00"}]}]}
```

Here weekday hours are the capacity, 5 effort days in 7 calendar days, and one window covers the 14 days. A window is elapsed time, not a daily timetable: one effort day at capacity 5 spans 1.4 elapsed days, so a window of one working day's hours fits nothing. When no person has capacity and a window in the horizon, the answer is `ok` with a `NO_FEASIBLE_SLOT` entry in `violations`: check `horizon_days`, `capacity_days_per_week` and `windows`, and tell the owner which task did not fit.

Working hours by weekday and local wall time are a different flow in `ambitious-scheduling`: `calendar add`, `availability set` and `plan propose`, which takes a `tasks-snapshot.v1` and a `horizon` with `start` and `end`, never `horizon_days` or `people`. The scheduling guide shows it. Do not mix the two inputs in one command.

Read the envelope and exit code after every command. An `ok:false` response contains a code, message and next-action hint; relay the useful information without inventing a successful result. The module works without network access or provider keys. Never place credentials or private bot files in task inputs.
