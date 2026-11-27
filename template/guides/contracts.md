# Contracts for bots

This is reference text for the `ambitious-contracts-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one. Where this text says "this skill", it means that skill.

Use this skill to track what a contract or an amendment obliges. The contract lives in the owner's organization on the Ambitious service: its text as a kept document, what it says as facts about one subject, and what it obliges as a recipe compiled from those facts. All of it is read and changed with the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`.
Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 15`. Under an earlier text call none of them and tell the owner that the instructions update turns this on; the `auto-update` guide says how that update is applied.
Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema.
The service keeps the text and where each fact was read from. It does not decide what a clause legally means, and neither do you.

## Facts are usable at once; a person activates the recipe

A fact is usable as soon as it is written. Nothing waits for a person: a view, a schedule and `compile_recipe` read it at once.
A signed-in member of the owner's organization may review a fact, with the document and the span it cites, on the service's `/records` page and mark it verified; the service records who did and when. That review is optional, no tool does it, and a bot never does. Never say a fact is verified unless `list_facts` shows it.
A recipe compiled from a contract is a draft. It runs only after a signed-in member activates it on `/records`. No tool activates it. After compiling, tell the owner once which draft waits there, and never say it is active unless `list_definitions` lists it.

## Keep the contract and write its facts

1. Turn the document into plain text and call `add_document` with an `idemKey` and the text as `body`. Give `series`, a stable name in lower-case letters, digits and hyphens, so that later versions of the same contract are found under one name. The answer holds the document's `id`, which is `doc:sha256:` followed by the hash of the text. The same text is kept once: sending it again answers with the same `id` and `duplicate` true. One version holds at most 262,144 bytes, and so does the whole request: a text close to that size is refused as `E_PAYLOAD_TOO_LARGE`.
2. Choose the contract's subject with the owner, such as `agreement:17`, as the `records` guide says.
3. Read the text and call `upsert_facts` with an `idemKey`, the `subject` and the facts. A fact is a `key`, a `value` and its `source`: `doc` is the document's `id`, never the series name, and `span` is the start and the end of the supporting text, counted in characters from 0, with the end not included. A key is a dotted lower-case name such as `payment.net_days` or `term.start`. Write a date as `"YYYY-MM-DD"` with `type` `date`, and a number of days as a whole number, so a recipe can use them. One write holds at most 50 facts, each key once.
4. Write only what the text says. Never paraphrase a value to make it fit, and leave out what the text does not state: an unknown is no fact, never a guess.
5. Read the answer: each fact is `written` or, when the same value with the same source was already current, `unchanged`.

`list_facts` with the contract's `subject` returns its current facts, each with its `source`, who wrote it and whether a person verified it. `get_document` with the `id` from a fact's `source` returns the text, so the span can be quoted: use both to answer "where does this come from". `get_document` with `series` returns the version that name points at now and the list of versions before it.

## Obligations, renewals and deadlines

What the contract obliges becomes the steps of a recipe. Call `compile_recipe` with the contract's `subject` and a `template`: a recipe that names the subject's kind and reads the facts by `facts.` followed by the key. The service writes each fact's value into the draft, keeps a step that lists keys in `from` only when the subject has every one of them and none is false, and records on every step the facts it came from. So one template serves contracts with and without a clause. Give each contract's template its own `id`. No model is called, and the same facts and template give the same draft.

```json
{"dslVersion":1,"kind":"recipe","id":"agreement-obligations","version":1,"title":"What an agreement obliges","subject":"agreement","triggers":[{"kind":"schedule","at":{"$":"facts.term.start"}}],"steps":[{"id":"report_due","kind":"wait","until":{"addBusinessDays":[{"$":"facts.term.start"},{"$":"facts.report.due_business_days"}]},"from":["report.due_business_days"]},{"id":"report","kind":"tool","action":"bot.prepare_report","from":["report.due_business_days"]},{"id":"accept","kind":"human","choices":["accept","send_back"],"from":["report.acceptance_required"]},{"id":"notice_due","kind":"wait","until":{"$":"facts.renewal.notice_by"},"from":["renewal.notice_by"]},{"id":"notice","kind":"human","choices":["renew","end"],"from":["renewal.notice_by"]},{"id":"done","kind":"return","output":{"agreement":"fulfilled"}}]}
```

A deadline is a `wait` step with `until`, work a bot does is a `tool` step whose `action` starts with `bot.`, and an approval or a decision is a `human` step with `choices`; the `tasks` guide lists the step kinds and how a bot does its step. A step without `from` is always kept, and a kept step that reads a missing fact is refused: write the fact first. The service sets the draft's `version`, `activation`, `source` and the one subject it runs on.
The answer holds the draft's `id`, `version` and `status`, the steps that were left out as `dropped`, and the `facts` used. When the facts have not changed since the last compile, the answer is that earlier version, with `unchanged` true and its present `status`. Otherwise tell the owner what was left out and why, and that the draft waits for a member on `/records`.
The service works out every date from the facts. Never calculate one yourself. Once the recipe is active, `list_schedules` with its `recipeId` shows the date that is armed, the dates that already started a run, and what is not armed and why; it returns at most 200 dates.

## Amendments

Keep the amended text as a new version: `add_document` with the same `series` returns a new `id`, and the earlier version stays readable under its own `id`. Then call `upsert_facts` with each changed fact and the new document as its `source`. A changed value replaces the current one at once, and the old value is kept as history.
Then call `compile_recipe` again with the same template. When the facts now cite two documents, name the amended one as `source`. A changed result is the next version of the draft, which a member activates; a run that already started keeps the version it started on and is not stopped. A new version starts its own run, also when its date is the same or has passed, so the same work can then wait in two runs: tell the owner which run is the earlier one. Tell the owner which facts changed and that a new draft waits on `/records`.

## Keys, limits and errors

Every `add_document` and `upsert_facts` needs an `idemKey`. Choose one key for each intended change and reuse it, with the same input, when retrying. `E_CONFLICT` with a message about the key means it was already used for a different request: read what exists instead of changing the payload. Do not repeat a timed-out write under a new key before reading whether it succeeded.
The service holds, for each organization, at most 1,000 documents and 1,000 series names. A fact value is at most 4,096 bytes, and a recipe has at most 32 steps. A count limit that was reached answers `E_CONFLICT` with a message that names it: tell the owner, and do not work around it. `E_NOT_FOUND` means a fact's source document is not stored, and a span that runs past the end of its document is refused. `E_ORG_NOT_READY` means the organization's storage is not ready yet: try again later, and keep nothing on this computer meanwhile. `E_UNAUTHENTICATED` means the connection is not signed in, and `E_FORBIDDEN` means its credential may not use this tool for an organization: for either, follow the `connect` guide of the `ambitious-getting-started` skill.
The service refuses text that holds a private key or a known kind of API key. That refusal is not the only guard: never keep a text that holds a credential, and never place one in any field. Remove it and tell the owner what was removed.

## Contracts an earlier template kept on this computer

Templates before 0.5.0 kept an obligation register in the `ambitious-contracts` module's database on this computer. That data stays where it is and stays readable with that module's `in-force` and `due` commands. Nothing moves by itself. When the owner wants a contract carried over, keep its text, write its facts and compile its recipe through the tools above. Add nothing new there, and never edit a module's database.
Template 0.5.0 kept contracts on the service through earlier tools of the connection, which this bot's instructions no longer name. Call none of them. The tools above do not read what was kept that way. When the owner wants such a contract carried over, keep its text again and write its facts through the tools above.
