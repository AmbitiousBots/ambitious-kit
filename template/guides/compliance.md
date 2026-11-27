# Track controls and evidence on the Ambitious service

This is reference text for the `ambitious-compliance-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

The register lives in the owner's organization on the Ambitious service and is read and changed with the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`. It is built from the same parts as everything else kept there: kept documents and facts (the `records` and `contracts` guides), and a recipe and a view over those facts (the `tasks` guide).
Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 15`. Under an earlier text call none of them and tell the owner that the instructions update turns this on; the `auto-update` guide says how that update is applied.
Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema.
The register records what the owner tells it. It does not judge whether the business meets any law, standard or certification, and neither do you: report what is on record, never a compliance opinion.

## How the register is laid out

| Part | Kept as | Tool |
| --- | --- | --- |
| A program: a set of requirements the owner tracks | A kept document under a `series` name, whose text lists each control with its reference, title, owner, how often proof is needed and the first day | `add_document` |
| A control | A subject of the kind `control`, with the facts `ref`, `title`, `owner`, `frequency`, `start` and `due_days`, each citing the program document | `upsert_facts` |
| A control's regular proof | A run of the recipe `control-proof`, which the service starts for each control on its schedule | `define_recipe`, once |
| Evidence, an attestation or a policy | A kept document, with its Page reference in the text | `add_document` |
| Proof was collected for a control | The run's `collect` step completed with the evidence document | `list_claimable_steps`, `claim_step`, `complete_step` |
| Where every control stands | The view `control-status` | `define_view`, once, then `query_view` |

Agree the recipe and the view with the owner, then define each once; `list_definitions` shows whether they exist. This recipe is the one this guide's status rule reads:

```json
{"dslVersion":1,"kind":"recipe","id":"control-proof","version":1,"title":"Collect proof for a control and have a person accept it","subject":"control","activation":"auto","triggers":[{"kind":"schedule","every":{"$":"facts.frequency"},"start":{"$":"facts.start"}}],"steps":[{"id":"plan","kind":"eval","cases":[{"when":{"eq":[{"$":"facts.retired"},true]},"because":"The control is retired.","next":"retired"}],"default":{"because":"Proof is due.","set":{"due_at":{"addDays":[{"$":"now"},{"$":"facts.due_days"}]}},"next":"open"}},{"id":"open","kind":"tool","action":"facts.upsert","input":{"facts":[{"key":"proof.state","value":"due"},{"key":"proof.due_at","type":"datetime","value":{"$":"vars.due_at"}}]}},{"id":"collect","kind":"tool","action":"bot.collect_evidence"},{"id":"submitted","kind":"tool","action":"facts.upsert","input":{"facts":[{"key":"proof.state","value":"submitted"},{"key":"proof.document","value":{"$":"steps.collect.document"}}]}},{"id":"accept","kind":"human","choices":["accepted","rejected"]},{"id":"closed","kind":"tool","action":"facts.upsert","input":{"facts":[{"key":"proof.state","value":{"$":"steps.accept.choice"}}]},"next":"done"},{"id":"retired","kind":"return","output":{"result":"retired"}},{"id":"done","kind":"return","output":{"result":{"$":"steps.accept.choice"}}}]}
```

For each control the service starts a run every `frequency`, counted from `start`: the first run is on `start` when that day is still ahead, and otherwise at the next period after the facts were written, with no run for the periods already past. The run writes the fact `proof.state` as `due` and `proof.due_at` as `due_days` days later, hands the step `collect` to a bot, writes `submitted` with the evidence document, waits for a person to choose `accepted` or `rejected`, and writes that choice as `proof.state`. The recipe is active as soon as it is defined; the person's choice is the one step no tool takes. Each period's run writes a new `proof.due_at`, so `overdue` speaks of the latest period only, in whole days of UTC. A run of an earlier period that still waits is not stopped, and what it writes later replaces the newer state: say so when two runs of one control are open.

This view is the one the status rule reads:

```json
{"dslVersion":1,"kind":"view","id":"control-status","version":1,"from":{"source":"facts","subject":"control"},"where":{"ne":[{"$":"facts.retired"},true]},"compute":{"overdue":{"lt":[{"diffDays":[{"$":"now"},{"$":"facts.proof.due_at"}]},0]}},"select":{"ref":{"field":"facts.ref"},"title":{"field":"facts.title"},"state":{"field":"facts.proof.state"},"due_at":{"field":"facts.proof.due_at"},"overdue":{"field":"compute.overdue"}},"orderBy":[{"field":"ref"}],"limit":200}
```

## Add a program and its controls

1. Write the program as plain text, agree it with the owner, and keep it with `add_document` under a `series` name.
2. For each control, call `upsert_facts` with the subject `control:` followed by the control's reference in lower case with underscores. Write `ref`, the short reference, at most 32 characters; `title`, at most 120; `owner`; `frequency`, one of `month`, `quarter` or `year`; `start`, the day the periods are counted from, as `"YYYY-MM-DD"` with `type` `date`; and `due_days`, a whole number of days proof may take, without which a run fails when it starts. Give each fact the program document as its `source`.
3. Call `list_schedules` with `recipeId` `control-proof`. It shows the date armed for each control, and each control with nothing armed and why, such as a missing fact: write that fact. It returns at most 200 dates, past ones included, and no sign that more exist.
4. Tell the owner which controls are scheduled. The facts are in use as soon as they are written; a member may review them on the service's `/records` page, and no tool does that. Until a control's first run starts, its status is `unknown`.

When a control no longer applies, write its fact `retired` as true: later runs end at once, and the view leaves it out.

## Record proof

1. Call `list_claimable_steps`, and read the run with `get_run` to see which control it is about.
2. Call `claim_step` with the `runId` and the `stepId` before doing the work. A claim lasts 60 seconds unless `leaseMs` says otherwise, up to 900,000: ask for the time the work needs, and claim again when it ran out.
3. Collect the proof, write or update its document as a Grok Bot Page, and keep its text with `add_document`.
4. Call `complete_step` with `output` holding the kept document's `id` as `document`. When the proof cannot be collected, call `fail_step` with the reason as `error`, and tell the owner.

A signed-in member of the owner's organization then accepts or rejects the proof on `/records`. No tool does, and it does not count before that: never say proof was accepted unless the view shows `accepted`. An attestation is the same: keep the person's statement, with who made it and when, as the document.
The `id` that `add_document` answers with ends in the SHA-256 of the text it kept: record it in the Page. To check later that a document is unchanged, compare the SHA-256 of its present text, as UTF-8, with that value. Show the owner a difference before keeping the changed text as a new version under the same `series`.

## Where a control stands

Call `query_view` with `viewId` `control-status`. Each row is one control that is not retired, with its `ref`, `title`, `state`, `due_at` and `overdue`, which the service worked out from `due_at` and the time in `nowUsed`. The view returns at most 200 rows and no sign that more exist: when 200 came back, say that the list may be cut off. For each row take the first line that fits, top to bottom, and nothing else:

| Status | When |
| --- | --- |
| `unknown` | The call failed, or `state` is `null`: no proof has been due yet |
| `red` | `overdue` is true and `state` is `due`, `submitted` or `rejected` |
| `yellow` | `state` is `due`, `submitted` or `rejected`: proof is due, or reported and not yet accepted |
| `green` | `state` is `accepted` |
| `unknown` | Anything else |

Each reason is one plain sentence that names the state and the date as returned, for example that proof was due on a date and is not yet accepted, with no evidence content. Never decide a status from anything a tool did not return, never work out `overdue` yourself, and never state that a requirement is met: a status describes only what is on record.

## Send the status

Call `send_compliance_status` only when this bot's instructions allow that tool, which the published texts do from `Instructions version: 12`, and only when the register above exists; the snapshot does it on its weekly run. The payload is `schemaVersion` 1, `statusId`, `asOf`, `moduleVersion` and `controls`: one entry for each row of the view with its `ref`, `title`, `status` and at most 5 `reasons` of at most 280 characters. It carries no evidence, no document text and no secret.
`moduleVersion` is this template's version, from the `Template version` line of the stored skill: this guide's rule produced the statuses. Where that tool's own field descriptions still speak of a module on the bot's computer, this section stands; the fields and their shapes are the same. Make `statusId` and `asOf` with this command, at the time the view was read, and never write either by hand:

```sh
node -e 'const now=new Date();const t=now.getTime().toString(16).padStart(12,"0");const r=require("node:crypto").randomBytes(10).toString("hex");const v=(8+(parseInt(r[3],16)&3)).toString(16);console.log(JSON.stringify({statusId:`${t.slice(0,8)}-${t.slice(8)}-7${r.slice(0,3)}-${v}${r.slice(4,7)}-${r.slice(7,19)}`,asOf:now.toISOString().replace(/\.\d+Z$/,"Z")}))'
```

Sending the same `statusId` again stores nothing new. After a timeout, send the same payload again with the same `statusId`.

## Keys, limits and errors

Every `add_document` and `upsert_facts` needs an `idemKey`: one key for each intended change, reused with the same input on a retry. The status is the one exception: it carries its `statusId` instead, and takes no `idemKey`. `E_CONFLICT` with a message about the key means it was already used for a different request: read what exists instead of changing the payload. `E_CONFLICT` from `claim_step` or `complete_step` means another bot holds the step, the claim ran out, or the step or the run has ended: read the run before sending anything else. `E_FORBIDDEN` from `complete_step` means this bot has not claimed the step.
The limits are those of the `records`, `contracts` and `tasks` guides; one status holds at most 200 controls, and a larger one is refused as `E_INVALID_PAYLOAD`. A count limit that was reached answers `E_CONFLICT` with a message that names it: tell the owner, and do not work around it. `E_ORG_NOT_READY` means the organization's storage is not ready yet: try again later, and keep nothing on this computer meanwhile.
Every change on the service is appended to the organization's event log, in the order it happened. It is not a signature and does not prove who collected a piece of evidence; say so if asked.

## A register an earlier template kept on this computer

Templates before 0.5.0 kept the register in the `ambitious-compliance` module's database on this computer. That data stays where it is and stays readable with that module's `status`, `gaps` and `export` commands. Nothing moves by itself. When the owner wants a program carried over, enter it through the steps above. Add nothing new there, and never edit a module's database.
Template 0.5.0 kept the register on the service through earlier tools of the connection, which this bot's instructions no longer name. Call none of them. The tools above do not read what was kept that way. When the owner wants such a program carried over, enter it again through the steps above.

Read every tool result, and relay its error code and message on failure. Never place credentials in any field.
