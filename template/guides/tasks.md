# Track work on the Ambitious service

This is reference text for the `ambitious-tasks-for-bots` and `ambitious-tasks-page` skills, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

Work lives in the owner's organization on the Ambitious service and is read and changed with the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`. There are two shapes. A commitment is something owed: who owes what to whom, and a rule that sets when it is due. A workflow is a repeatable process: steps a bot or a person does, and each time it is carried out is a run.
Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 14`. Under an earlier text call none of them and tell the owner that the instructions update turns this on; the `auto-update` guide says how that update is applied.
Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema.

## You propose; people decide

A signed-in member of the owner's organization decides on the service's `/records` page. No tool does any of these:

| The bot does | A member then does, on `/records` |
| --- | --- |
| `propose_commitment` | Activates it, or rejects it. Nothing is scheduled before that. |
| `complete_obligation` | Accepts the work, or sends it back. Unless the commitment needs no acceptance, it does not count before that. |
| Nothing | Waives open or overdue work, with a reason. |

After a proposal or a completion, tell the owner once what is waiting on `/records`. Never say a commitment is active or work is accepted unless `get_commitment`, `list_commitments` or `whats_due` shows it.

## Commitments

| When | Tool | Input |
| --- | --- | --- |
| Something is owed, once or regularly | `propose_commitment` | `idemKey`, `subjectId`, `title`, `obligor`, `obligee`, `rule`; optional `owner`, `objective`, `acceptance`, `workflowId`, `needs`, `yields` |
| Finishing one piece of work should start another | `bind_commitments` | `idemKey`, `from` and `to`, each a `commitmentId` and a `signal` |
| The owner asks what is due, or a routine looks for work | `whats_due` | Optional `days` (30 when left out, up to 400) and `limit` |
| Work that was due is done | `complete_obligation` | `idemKey`, `occurrenceId`, `rev`, optional `evidence` |
| Reading one commitment | `get_commitment` | `commitmentId` |
| Listing commitments | `list_commitments` | Optional `cursor`, `limit` |

`subjectId` is a kept document: the one whose confirmed facts set the dates. Keep the document first and propose its facts, as the `contracts` guide says; for work that comes from no contract, keep a short document that states what was agreed and when.
A `rule` is one of four kinds. `recurring`: every `month`, `quarter` or `year` from a `start` fact, due `dueDays` after each period ends, in business days when `businessDays` is true. `before_date`: `days` before the date in a fact. `on_date`: on the date in a fact, opening `leadDays` before. `after_signal`: `days` after a signal arrives. A date is named as `{"fact": "..."}`, the key of a confirmed fact that holds `YYYY-MM-DD`; a number of days is a number or such a fact. Weekends are the only days not counted as business days.
The service, not the bot, works out every date. The answer to `propose_commitment` lists the facts the rule still lacks: with a fact missing nothing is scheduled, so propose that fact and tell the owner. When a confirmed fact changes, the service works the dates out again by itself.
`needs` and `yields` name signals, dotted names such as `report.accepted`. `bind_commitments` connects a signal one commitment yields to the same signal another needs, so that satisfying the first starts the second; the receiving commitment must still be a proposal, so the member who activates it sees the connection. `get_commitment` shows a needed signal nothing is connected to.

One dated piece of work is an occurrence. It is `scheduled`, then `open` when its time comes; `submitted` once the bot reported it done; `satisfied` once a member accepted it; `overdue` when open work passes its date; `waived` or `superseded` when it no longer applies. Every occurrence carries a `rev`: send the `rev` you read with `complete_obligation`, and on `E_CONFLICT` read it again before deciding. `evidence` is a kept document (`documentId`) or, for a commitment that names a workflow, the completed run that did the work (`runId`).
`whats_due` returns what the organization owes or is owed within the coming days, soonest first, each with its state, its `rev` and the confirmed facts its date comes from. That list and `list_commitments` are the truth the service holds. Do not keep a second list, and never work out a count, a ranking or a date yourself: show what was returned, and say when a list was cut off by `limit` or has a `nextCursor`.

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
Put a step's scalar outputs in `result.fields` and optional public text in `result.summary`. Retry an uncertain completion with the same `attempt`, `idempotencyKey` and `result`: the first outcome comes back. On `E_CONFLICT`, read the run before sending anything else. A step for a person is done by a person; never claim one.

## Present work as a Page

This is the layout the `ambitious-tasks-page` skill renders. The bot writes the Grok Bot Page from what the tools return; the service holds the work and writes no Pages.

1. Call `whats_due` for the days the owner asked about, 30 when they did not say, and `list_commitments`. Follow `nextCursor` to the end, or say that the list was cut off.
2. Render the due items in the order `whats_due` returned them, soonest first: title, who owes it to whom, due date and state, each as returned. Do not rank or re-sort them.
3. Add a section "Waiting for a person": each commitment still proposed, which a member activates, and each item reported done and not yet accepted. Say that both are decided on the service's `/records` page. Never show either as active or done.
4. For a commitment the owner asks about, call `get_commitment` and show the facts its rule still lacks and the needed signals nothing is connected to, as returned.
5. For a repeatable process, show each run's status from `list_workflow_runs`, and its steps from `get_workflow_run` when asked.
6. State the days looked ahead and when the tools were called, so a reader knows the scope and freshness.
7. After a change, call the tools again and refresh the Page from the new results. A Page edit alone never changes what the service holds.

Never count, total, date or rank anything yourself: show what a tool returned. If a call fails, report its error and do not publish stale data as current. Follow the owner's existing Page sharing and publishing permissions.

## Keys, limits and errors

Every `propose_commitment`, `bind_commitments` and `complete_obligation` needs an `idemKey`. Choose one key for each intended change and reuse it, with the same input, when retrying. `E_IDEMPOTENCY` means the key was already used for a different request: read what exists instead of changing the payload. Do not repeat a timed-out write under a new key before reading whether it succeeded.
The service holds, for each organization, at most 200 commitments that are proposed or active, 8 signals a commitment, and 24 occurrences scheduled ahead within 400 days; and at most 50 running runs, with 16 steps in a workflow. `E_LIMIT` means one was reached: tell the owner, and do not work around it. `E_ORG_NOT_READY` means the organization's storage is not ready yet: try again later, and keep nothing on this computer meanwhile. `E_FORBIDDEN` means the connection is not signed in for the owner's organization: follow the `connect` guide of the `ambitious-getting-started` skill.

## Tasks an earlier template kept on this computer

Templates before 0.5.0 kept tasks in the `ambitious-tasks` module's database on this computer. That data stays where it is and stays readable with that module's `list`, `get` and `counts` commands. Nothing moves by itself. When the owner wants open work carried over, read it with the module, agree with the owner what each item becomes, and propose it through the tools above. Add no new work there, and never edit a module's database. The module still supplies the task rows a schedule plan places, as the `scheduling` guide says; a plan never changes what the service holds.

Read every tool result, and relay its error code and message on failure without inventing a successful result. Never place credentials or private bot files in any field.
