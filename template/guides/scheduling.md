# Schedule work with Ambitious Scheduling and check decisions with Ambitious Constraints

This is reference text for the `ambitious-scheduling-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

Two modules do this work, and neither knows the other exists.

- `ambitious-scheduling` owns time: calendars with time zones, working hours, imported busy time, and versioned plans that place tasks into blocks of free working time. It needs Node 24 and nothing else.
- `ambitious-constraints` checks a decision stated as a model: is there a plan that satisfies every rule, which is best, and when there is none, which rules cannot all hold and what is the least to give up. It needs Python 3.13, and its solving commands need a pinned runtime; see "The solver runtime" below.

Run each through its link in `bin` under `AMBITIOUS_HOME`, for example `/workspace/ambitious/bin/ambitious-scheduling`. The command words are separate arguments: `ambitious-scheduling plan propose`, `ambitious-constraints model commit`. Pass one JSON object on stdin or with `--in`, never both, and keep input files outside `/home/box/agent-data`. `commands` lists every operation with its input. Run `selfcheck` at routine start and resolve what `data.problems` reports before writing. Every input shape is documented at https://github.com/AmbitiousBots/ambitious-scheduling#readme and https://github.com/AmbitiousBots/ambitious-constraints#readme; that documentation is not a file on this computer.

Read the envelope and the exit code after every command. Require the expected `module` and `command`, a successful exit and `ok: true` before using a result. When `ok` is false, relay `errors[].message` and `errors[].hint`, and `data.problems[]` or `data.violations[]` when present, in plain words. Never invent a result.

## What crosses between modules

A module never starts, imports or reads another module. The bot carries each document, unchanged, and only in these shapes:

| Document | Made by | Given to |
| --- | --- | --- |
| `tasks-snapshot.v1` | The bot, by wrapping the rows of `ambitious-tasks list` as `{"schema":"tasks-snapshot.v1","tasks":[...]}` without editing a row | `ambitious-scheduling plan propose`, `plan check`, `plan model`, `plan commit`, `plan task-updates` |
| `schedule-plan.v1` | `ambitious-scheduling plan propose` (`data.plan`, status `proposed`) and `plan get` (status `committed`) | `plan commit`, and the Page the owner reads |
| `constraint-model.v1` | `ambitious-scheduling plan model` (`data.model`), or the bot with the owner for any other decision | `ambitious-constraints model validate`, `model propose`, `solve`, `explain`, `whatif`, `sweep` |
| `constraint-solution.v1` | `ambitious-constraints solve` (`data.solution`) | `ambitious-scheduling plan propose` as `solution`, with the unchanged `mapping` from `plan model` |
| `calendar-holds.v1` | `ambitious-scheduling plan holds` (`data.holds`) | The Page the owner reads; the owner applies it in their own calendar |

`plan task-updates` returns `suggestedUpdates`: each entry is the exact input of `ambitious-tasks update`. Forward each one unchanged, with its `idem_key`. Never change a due date yourself.

## Set up calendars

| Command | Input |
| --- | --- |
| `calendar add` | `{"id":"desk-1","name":"Front desk","tz":"Europe/Paris","kind":"person","person_ref":"desk-1","idem_key":"add-desk-1"}`. `tz` is an IANA zone name; `kind` is `person`, `resource` or `team`; `person_ref` equals the assignee name the task module uses. |
| `availability set` | `{"calendar_id":"desk-1","expected_version":1,"rules":[{"days":["MO","TU","WE","TH","FR"],"start":"09:00","end":"17:00"}],"exceptions":["2026-05-01"],"idem_key":"hours-desk-1"}`. Times are the calendar's local wall time. Read the version with `calendar get` first. |
| `busy import` | `{"calendar_id":"desk-1","source":"calendar","window":{"start":"...","end":"..."},"taken_at":"...","blocks":[{"start":"...","end":"..."}],"idem_key":"busy-desk-1-week-19"}`. One call per calendar. Import intervals only; leave titles out unless the owner asked for them. |
| `free` | `{"calendar_ids":["desk-1"],"from":"...","to":"...","min_minutes":30}`. Free time is working hours minus busy time. |

Busy time is what this bot read through its own read-only calendar tools, when the owner has connected a calendar and such a tool is available to this bot; otherwise ask the owner for the busy intervals. The module never contacts a calendar service.

## A minimal sketch: one person, weekday hours, 14 days

Three commands, each with its own input. Set the person up once:

```json
{"id":"desk-1","name":"Front desk","tz":"Europe/Paris","kind":"person","person_ref":"desk-1","idem_key":"add-desk-1"}
```

That is `calendar add`. The field is `tz`, an IANA zone name; `timezone` is refused. Then `availability set`, with weekday rules in the calendar's local wall time:

```json
{"calendar_id":"desk-1","expected_version":1,"rules":[{"days":["MO","TU","WE","TH","FR"],"start":"09:00","end":"17:00"}],"exceptions":[],"idem_key":"hours-desk-1"}
```

Then `plan propose`, with the task rows wrapped as a `tasks-snapshot.v1` and a 14-day `horizon` given as `start` and `end`:

```json
{"tasks":{"schema":"tasks-snapshot.v1","tasks":[]},"horizon":{"start":"2026-05-04T00:00:00Z","end":"2026-05-18T00:00:00Z"},"policy":{"block_minutes":120,"due":"soft"}}
```

Put the unchanged rows of `ambitious-tasks list` in `tasks`. A task is placed on the calendar whose `person_ref` is its assignee.

`ambitious-tasks schedule suggest` is a different flow with a different input: `horizon_days` and a `people` roster of `id`, `capacity_days_per_week` and `windows`, sent with every call and never stored. `plan propose` refuses `horizon_days` and `people`, and `schedule suggest` knows no calendar. Do not mix the two inputs in one command; the tasks guide shows that one.

## Plan, approve, commit

Follow this order every time.

1. Read the tasks with `ambitious-tasks list` and wrap the rows as a `tasks-snapshot.v1`.
2. When a calendar is connected and this bot has a read-only tool for it, read busy time for the planning window and store it with `busy import`.
3. Run `plan propose` with `{"tasks": snapshot, "horizon":{"start":"...","end":"..."}, "policy":{"block_minutes":120,"due":"soft"}}`. It stores nothing. `--now` is the earliest moment a plan may start.
4. Show the owner the proposed blocks, every entry of `violations` and `unscheduled`, and any `notes`, in a Grok Bot Page. State at the top "Proposed, not stored". Group blocks by calendar and local date, with times as returned. Say plainly which tasks did not fit and why, in the messages returned.
5. Commit only after the owner approves that exact plan in this bot's own chat: `plan commit` with `{"plan_id":"...","base_version":0,"digest":plan.digest,"tasks_digest":plan.tasks_digest,"plan":plan,"tasks":snapshot,"idem_key":"...","actor":"..."}`. `base_version` is 0 for a new plan id, otherwise the version read with `plan get`. Pass `allow_violations` only when the owner accepted the listed violations.
6. Run `plan task-updates` with a current snapshot and forward each suggested update to the task module. Report its `notes`.
7. Run `plan holds` and follow "Calendar holds" below.

When a commit is refused, do what the code says and ask again. `E_STALE`: someone committed first; read the plan and propose again. `E_TASKS_CHANGED` or `E_CALENDAR_CHANGED`: a task, working hours or busy time changed since the proposal; read them again, propose again and get approval for the new plan. `E_DIGEST`: the plan sent is not the plan proposed; commit it exactly as returned. `E_VIOLATIONS`: the plan has errors; they are in `data.violations`. Never work around a refusal by editing blocks.

To try an alternative without touching the approved plan, run `plan clone` with a `new_id` and commit there. `plan history` and `plan diff` show what changed between versions.

Every write takes an `idem_key`. Choose one stable key per intended action and keep the key and the input unchanged for a retry. `E_IDEM_CONFLICT` means the key was used for a different request: look at the original action.
A write `actor` is 1 to 200 Unicode characters, with no control characters or line breaks, no leading or trailing whitespace, and internal spaces allowed. Nothing is trimmed. The `E_INPUT_SCHEMA` hint states this rule. When the installed module refuses such an actor, it has its own older rule: follow its message.

Never compute free time, block times, time zone conversions or durations by hand. `start` and `end` are UTC; `local_start` and `local_end` carry the calendar's offset. A proposed plan is not a commitment, and a committed plan is not a calendar event: say which of the three the owner is looking at.

## Calendar holds

`plan holds` with `{"plan_id":"..."}` returns a `calendar-holds.v1` proposal for one committed version. Each hold has a title, `start` and `end`, a `calendar_hint`, an `idempotency_key` and an `action`:

| `action` | Meaning |
| --- | --- |
| `create` | No event is recorded as created for this hold. |
| `keep` | An event is recorded as created; `external` names it. |
| `cancel` | An event is recorded for a hold the plan no longer has; `external` names it. |

A hold is a proposal and nothing more. Show the owner, in a Page, what would be created, kept and canceled, each with its title and times as returned. The owner applies it in their own calendar. This bot never creates, changes or cancels a real calendar event, whatever tools it has: its instructions grant no write to a calendar. Never list a hold the proposal does not have.

When the owner says in this bot's own chat what they did, record it with `holds record`: `{"plan_id":"...","records":[{"idempotency_key":"...","status":"created","provider":"...","event_id":"..."}],"idem_key":"..."}`. `status` is `created`, with the event id when the owner gave one, `canceled`, or `failed` with a `note`; `provider` names the calendar the owner used. Record only what the owner reported. A later `plan holds` then proposes nothing twice. A clone has its own holds: propose holds for one plan id only.

## Decisions that must satisfy rules

Use `ambitious-constraints` when the owner asks whether a plan can satisfy everything, which option is best, why goals cannot all hold, or what is the least to give up. A model is a `constraint-model.v1`: variables, named integer parameters, constraints and the evidence behind each number.

Build the model with the owner. Every number is a parameter with evidence: where it came from, and whether it is `sourced`, `derived` or an `assumption`. Never mark a guess as sourced. Give each constraint a plain `label` and its `category`: what the owner wants is a `desire` or a `goal`, what is true is a `fact`, what will not bend is a `policy`, what nobody has checked is an `assumption`. Only desires and goals are offered as things to give up.

| Command | Needs the runtime | Use |
| --- | --- | --- |
| `model validate` | No | `{"model": ...}`: problems and counts. Stores nothing. |
| `model propose` | No | `{"model": ..., "model_id":"..."}`: the `digest`, the `base_version` and the `diff` against the stored version. Stores nothing. |
| `model commit` | No | `{"model_id":"...","base_version":0,"digest":"...","model": ...,"idem_key":"...","actor":"..."}`, only after the owner approved the proposal shown. |
| `model clone` | No | `{"model_id":"...","new_id":"...","idem_key":"...","actor":"..."}`: a copy to try a variant. Never edit a model in place to explore. |
| `solve` | Yes | `{"model_id":"..."}` or `{"model": ...}`, with `scenario` and `limits` when needed: a `constraint-solution.v1`. |
| `explain` | Yes | The same input, when `solve` answers `infeasible`: `mus`, the smallest sets that cannot all hold, and `mcs`, the smallest sets of desires and goals whose removal makes it possible. |
| `whatif` | Yes | `{"model_id":"...","scenarios":["..."]}`: one solution per scenario and the `differences`. |
| `sweep` | Yes | `{"model_id":"...","param":"...","grid":[1,2,3]}`: where the answer changes as one assumption moves. |
| `run record` | No | `{"envelope": ..., "idem_key":"...","actor":"..."}`: keeps the whole envelope a command printed. |

When relaying a result:

- Say what was proved, in the module's word. `optimal`: no better plan exists. `feasible`: a plan was found and the search stopped at its limit, so never call it the best. `infeasible`: no plan exists; run `explain`. `unknown`: no answer yet; raise `limits.deterministic_time` or make the model smaller.
- When `rests_on_assumptions` is not empty, say so first and name those constraints by their labels.
- When `checked.violations` is not empty, do not use the result; report it as a fault in the module.
- Present each conflict set as "these cannot all hold" and each correction set as "giving up these would make it possible". Dropping a goal is the owner's decision: offer the sets, pick none, and change no model until the owner chooses. When `complete` is false, say more conflicts may exist.

## A better or explained schedule

When the owner asks for a better plan than the proposed one, or why a schedule cannot meet its dates:

1. Run `ambitious-scheduling plan model` with the same input as `plan propose`. It returns `data.model` and `data.mapping`. It refuses a policy with `max_minutes_per_day` with `E_UNSUPPORTED`.
2. Pass `data.model` to `ambitious-constraints solve` as `{"model": ...}`.
3. Pass `data.solution` back to `ambitious-scheduling plan propose` as `solution`, with the unchanged `mapping`. The scheduling module's own checker runs on the result.
4. Show it like any other proposal. `E_NO_SOLUTION` means the solution places nothing: run `explain`, or keep the plan proposed without a solution.

## The solver runtime

`solve`, `explain`, `whatif` and `sweep` need the constraints module's pinned runtime: a Python environment of about 200 MB holding the solver packages. The sync command never builds it unasked, so a first `selfcheck` is ok and lists the missing runtime under `data.warnings`, and a solving command answers `E_RUNTIME`. Storing, validating and showing models works without it, and so does every scheduling command.

Building it downloads about 200 MB of packages from the Python package index. Each is checked against a SHA-256 pinned in the module's release, but they are not release files. Run the command below only when both hold: the owner asked for solving in this bot's own chat, and this bot's instructions allow that download. The instructions published up to version 8 allow only the pinned public release files, so under them do not run it: tell the owner that solving needs the solver runtime and that this bot's instructions do not allow that download yet, and use only the constraints commands that need no runtime, with the scheduling module's own `plan propose` for a schedule. Version 9 and later allow that download, and nothing else from the Python package index, when a constraints task needs it. When both hold, say what will be downloaded and that it stays on this computer, then run:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json --runtime constraints
```

Read `data.modules[]` for `constraints`: `runtime.action` is `installed` or `unchanged`. A build that failed is in `data.problems`, leaves nothing half-built and leaves the module usable as before. Then run `ambitious-constraints selfcheck` and require `data.pinnedRuntime.state` to be `ready`. Never install the packages any other way.
