# Track work on the Ambitious service

This is reference text for the `ambitious-tasks-for-bots` and `ambitious-tasks-page` skills, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

Work lives in the owner's organization on the Ambitious service and is read and changed with the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`. There are three shapes. A piece of work is a subject with facts: what it is, who owns it, when it is due and how it stands. A recipe is repeatable work the service runs from those facts: steps for the service, a bot or a person, with waits and branches. A workflow is a process the owner keeps as a map of steps, and each time it is carried out is a run.
Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 15`. Under an earlier text call none of them and tell the owner that the instructions update turns this on; the `auto-update` guide says how that update is applied.
Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema.

## What a bot does and what a person does

A fact is usable as soon as it is written, and so is work kept as facts: nothing waits for a person. A signed-in member of the owner's organization does these on the service's `/records` page, and no tool does any of them:

| A member does | What it means for the bot |
| --- | --- |
| Marks a fact verified | An optional review, recorded on the fact with who and when. Do not wait for it. |
| Activates a recipe whose `activation` is `person` | Until then the recipe is a draft and starts no run. |
| Answers a `human` step | The run waits at that step. Tell the owner which run waits and for what. |

Never say a fact is verified, a recipe is active or a step was answered unless `list_facts`, `list_definitions` or `get_run` shows it.

## Work as facts

| When | Tool | Input |
| --- | --- | --- |
| Work to remember, or a change to it | `upsert_facts` | `idemKey`, `subject` such as `task:` followed by an id, and `facts` |
| Work that was due is done | `upsert_facts` | The same `subject`, with `state` as `done` and `done_on` |
| The owner asks what is due, or a routine looks for work | `query_view` | `viewId` |
| Reading one piece of work | `list_facts` | `subject` |
| Something happened that a recipe waits for or starts on | `emit_signal` | `idemKey`, `name`, optional `subject` and `payload` |

Agree the kind and the keys with the owner once, as the `records` guide says, and use them for every piece of work: `title`, `owner`, `state`, and `due_on` as `"YYYY-MM-DD"` with `type` `date`. This view lists the work of that kind that is not done and is due within 30 days or already late, soonest first; define it once with `define_view`:

```json
{"dslVersion":1,"kind":"view","id":"due-soon","version":1,"from":{"source":"facts","subject":"task"},"where":{"and":[{"ne":[{"$":"facts.state"},"done"]},{"lte":[{"diffDays":[{"$":"now"},{"$":"facts.due_on"}]},30]}]},"select":["subject","facts.title","facts.owner","facts.due_on","facts.state"],"orderBy":"facts.due_on","limit":200}
```

That view is the truth the service holds. Do not keep a second list, and never work out a count, a ranking or a date yourself: the service compares each date with the time in `nowUsed`. A view returns no sign that more exist: when as many rows came back as its `limit`, say that the list may be cut off. For another number of days, define another view with its own `id`.
A signal name is two lower-case words joined by a dot, such as `report.accepted`, and may not start with `fact`, `document` or `subject`. Give `subject` when the signal is about one piece of work. Repeating the same `idemKey` emits once.

## Recipes

| When | Tool | Input |
| --- | --- | --- |
| The owner describes repeatable work, or a change to it | `define_recipe` | `recipe`: `dslVersion` 1, `kind` `recipe`, `id`, `version`, `triggers`, `steps`, and optional `title`, `subject`, `activation`, `budget` |
| Steps that follow from one subject's facts, such as a contract | `compile_recipe` | `subject`, `template`, optional `source`, as the `contracts` guide says |
| Reading the active recipes and views | `list_definitions` | Optional `kind`, `limit` |
| Before a run that may cost money, or to check a recipe | `plan_recipe` | `recipeId`, optional `input`, `subject`, `offline` |
| Starting a run by hand | `run_recipe` | `recipeId`, optional `input`, `subject`, `triggerKey` |
| Reading a run and its steps | `get_run` | `runId` |
| Reading what a recipe has scheduled | `list_schedules` | `recipeId` |
| Looking for a step to do | `list_claimable_steps` | Optional `limit` |
| Taking a step | `claim_step` | `runId`, `stepId`, optional `leaseMs` |
| The step is done, or failed | `complete_step`, `fail_step` | `runId`, `stepId`, and `output` or `error` |

A recipe is a list of steps, and each step's `kind` is one of seven. `eval` chooses a branch from `cases`. `ai` calls a model. `tool` runs an action: `documents.ingest`, `facts.upsert`, `views.query` or `signals.emit` on the service, or a name starting with `bot.` for work a bot claims and does. `human` waits for a person, with `choices`, or with `verifies` naming the step whose facts the person reviews. `wait` pauses `for` a time, `until` a date or for a `signal`. `return` ends the run. `recipe` calls another recipe by `ref`. Every path ends in a `return`, and no step chooses its own branch: only the recorded facts, inputs and step outputs do.
A recipe starts by its `triggers`: `manual`; `event`, one of `document.ingested`, `fact.written`, `fact.verified` or `subject.created`; `schedule`, with `every` or `at`; or `signal`. A recipe that reads facts names its `subject` kind, and each run is about one subject of that kind. The service, not the bot, works out every date and keeps every timer; all dates are in UTC.
Agree a recipe with the owner before defining it. A definition is never changed: send a changed recipe with a higher `version`. With `activation` `auto` it is active at once, unless an earlier version of the same `id` waited for a person; with `person`, and always when compiled, it is a draft until a member activates it. The answer's `status` says which. The same or a lower `version` of an existing `id` answers `E_CONFLICT`. Put no personal data and no secret in a definition.
`run_recipe` needs `subject` when the recipe names a subject kind. Give a `triggerKey` so that a retry starts no second run. A recipe of only `eval` and `return` steps answers at once with its `output`; any other starts a run and answers with its record: keep the run's id. When the answer says the engine is unavailable, the run exists and has not started: call `run_recipe` again with the same `triggerKey`.
To do a step: claim it, and only then do the work. A claim lasts 60 seconds unless `leaseMs` says otherwise, up to 900,000: ask for the time the work needs, and claim again when it ran out. Finish with `complete_step` and the step's `output`, an object of at most 16,384 bytes that the later steps read, or with `fail_step` and the reason. `E_CONFLICT` means another bot holds the step, the claim ran out, or the step or the run has ended: read the run before sending anything else. `E_FORBIDDEN` from `complete_step` or `fail_step` means this bot has not claimed the step: claim it first. Never claim or answer a `human` step: the service refuses with `E_FORBIDDEN`, and `list_claimable_steps` does not list one.

## Workflows and runs

| When | Tool | Input |
| --- | --- | --- |
| The owner describes a repeatable process, or a change to one | `send_workflows` | Up to 20 workflow definitions, each with `baseVersion`: 0 for a new one, or the version read from `list_workflows` |
| Reading the stored workflows and their versions | `list_workflows` | Optional `cursor`, `archived` |
| A process starts | `start_workflow_run` | `workflowId` and `facts`, scalar values or `{}` |
| Looking for a step to do | `list_claimable_workflow_steps` | Optional `limit` |
| Reading runs | `list_workflow_runs`, `get_workflow_run` | Optional `workflowId`, `status`, `cursor`; or `runId` |
| Taking a step | `claim_workflow_step` | `runId`, `nodeId`, `version`; optional `leaseSeconds` |
| The step is done | `complete_workflow_step` | `runId`, `nodeId`, `version`, `attempt`, `idempotencyKey`, `result` |
| The step failed, or cannot be done now | `fail_workflow_step`, `release_workflow_step` | `runId`, `nodeId`, `version`, `attempt` |
| The owner stops a run | `cancel_workflow_run` | `runId`, `version` |

Agree a workflow with the owner before sending it. On `E_CONFLICT` from `send_workflows`, read the current version with `list_workflows` and apply the change again. Put no personal data and no secret in a definition.
Each `start_workflow_run` call starts a new run: keep the returned `runId`. When its answer says the engine is unavailable, the run still exists: carry on by polling `list_claimable_workflow_steps`.
To do a step: read the run with `get_workflow_run` for its current `version`, claim the step, and only then do the work. The claim answers with an `attempt` and the time the lease ends, 600 seconds unless `leaseSeconds` says otherwise. Keep that `attempt` for the completion, failure, release or renewal. Finish before the lease ends, or renew it by claiming again with `renew` true, the `attempt` and the current `version`. After a lease ends another bot may claim the step.
Put a step's scalar outputs in `result.fields` and optional public text in `result.summary`. Retry an uncertain completion with the same `attempt`, `idempotencyKey` and `result`: the first outcome comes back. On `E_CONFLICT`, read the run before sending anything else. Never claim a step for a person: the service answers `E_STEP_NOT_CLAIMABLE`, and `list_claimable_workflow_steps` does not list one. When a run reaches such a step it waits there, so tell the owner which run is waiting and for what.

## Present work as a Page

This is the layout the `ambitious-tasks-page` skill renders. The bot writes the Grok Bot Page from what the tools return; the service holds the work and writes no Pages.

1. Call `query_view` for the view of due work the owner asked about, `due-soon` when they did not say.
2. Render the rows in the order the view returned them, soonest first: title, owner, due date and state, each as returned. Do not rank or re-sort them.
3. Add a section "Waiting for a person": each draft recipe a `compile_recipe` or `define_recipe` answer gave you that `list_definitions` does not list as active, and each run you started or worked in whose `get_run` shows a step waiting for a person. No tool lists every draft or every run, so say that the service's `/records` page holds the full list and that both are decided there. Never show either as active or done.
4. For a recipe the owner asks about, call `list_schedules` and show the armed dates, and what is not armed and why, as returned. It returns at most 200 dates, past ones included, and no sign that more exist.
5. For a workflow, show each run's status from `list_workflow_runs`, and its steps from `get_workflow_run` when asked.
6. State the view's `refreshedAt` and `nowUsed` and how many days it looks ahead, so a reader knows the scope and freshness.
7. After a change, call the tools again and refresh the Page from the new results. A Page edit alone never changes what the service holds.

Never count, total, date or rank anything yourself: show what a tool returned. If a call fails, report its error and do not publish stale data as current. Follow the owner's existing Page sharing and publishing permissions.

## Keys, limits and errors

Every `upsert_facts` and `emit_signal` needs an `idemKey`. Choose one key for each intended change and reuse it, with the same input, when retrying. `E_CONFLICT` with a message about the key means it was already used for a different request: read what exists instead of changing the payload. Do not repeat a timed-out write under a new key before reading whether it succeeded.
A recipe has at most 32 steps and a definition is at most 64 KB; a workflow has at most 16 steps, and the service holds at most 50 running workflow runs for each organization. A larger definition is refused as `E_INVALID_PAYLOAD`. `E_LIMIT` means a recipe's budget or the limit on workflow runs was reached, and `E_CONFLICT` whose message names a limit means that limit was reached: tell the owner, and do not work around it. `E_NOT_FOUND` means the recipe, view or run is not stored or not active. `E_ORG_NOT_READY` means the organization's storage is not ready yet: try again later, and keep nothing on this computer meanwhile. `E_UNAUTHENTICATED` means the connection is not signed in, and `E_FORBIDDEN` from any other tool means its credential may not use this tool for an organization: for either, follow the `connect` guide of the `ambitious-getting-started` skill.

## Tasks an earlier template kept on this computer

Templates before 0.5.0 kept tasks in the `ambitious-tasks` module's database on this computer. That data stays where it is and stays readable with that module's `list`, `get` and `counts` commands. Nothing moves by itself. When the owner wants open work carried over, read it with the module, agree with the owner what each item becomes, and write it through the tools above. Add no new work there, and never edit a module's database. The module still supplies the task rows a schedule plan places, as the `scheduling` guide says; a plan never changes what the service holds.
Template 0.5.0 kept what is owed on the service through earlier tools of the connection, which this bot's instructions no longer name. Call none of them. The tools above do not read what was kept that way. When the owner wants such work carried over, the owner reads it on the service's `/records` page and says what to enter.

Read every tool result, and relay its error code and message on failure without inventing a successful result. Never place credentials or private bot files in any field.
