# Keep records as facts on the Ambitious service

This is reference text for the `ambitious-records-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

A record lives in the owner's organization on the Ambitious service as a subject and the facts about it, and is read and changed with the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`. A subject is anything the owner keeps a record of, written as its kind, a colon and its id, such as `lead:42`. A fact is one typed value about a subject under a dotted key, such as `owner` or `payment.net_days`. There is one store of facts: a list of records is a view over them.
Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 15`. Under an earlier text call none of them and tell the owner that the instructions update turns this on; the `auto-update` guide says how that update is applied.
Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema.

| When | Tool | Input |
| --- | --- | --- |
| A new record, or values of one change | `upsert_facts` | `idemKey`, `subject` and `facts`: 1 to 50 entries of `key` and `value`, each with an optional `type` and `source` |
| Reading one record | `list_facts` | `subject`, alone |
| Reading every record, or every record of one kind | `list_facts` | Optional `kind` and `limit`; `after` is the `subject` and `key` of the last fact of the page before |
| The owner wants a list kept: a filter, an order or a count | `define_view` | `view`: `dslVersion` 1, `kind` `view`, `id`, `version`, `select`, and optional `title`, `from`, `where`, `compute`, `groupBy`, `orderBy`, `limit` |
| Reading that list | `query_view` | `viewId` |

## Subjects, keys and types

A kind is a lower-case word of at most 32 letters, digits and underscores, starting with a letter. An id is letters, digits, dots, underscores and hyphens, starting with a letter or a digit. The whole subject is at most 64 characters. Agree the kind and the keys with the owner before the first write, and use the same ones for every record of that kind: a view finds records by them.
A key is one to eight lower-case segments joined by dots, each starting with a letter and at most 32 characters. A key may not end in `verified`, `verified_by` or `verified_at`: those words read a fact's review.
A type is `text`, `int`, `number`, `bool`, `date`, `datetime` or `json`. When `type` is left out, the service takes it from the value: a string is `text`. So give `type` `date` with a date written `"YYYY-MM-DD"`, and `type` `datetime` with an instant, so that the service refuses a value that is not one.
A stage is a fact like any other, such as `stage` with the value `open`. The service does not check which stage may follow which: agree the stages with the owner, and where a move needs steps or a person's decision, keep it as a recipe, as the `tasks` guide says.

## Writing and reading

A fact is usable as soon as it is written: every view, recipe and schedule reads it at once, and nothing waits for a person. Writing an equal value, with the same type and source, changes nothing. Writing a different one replaces the current fact, and the service keeps the old value as history. The answer lists each fact with its `outcome`, `written` or `unchanged`.
`list_facts` returns the current facts with who wrote each, its `source` when it has one, and whether a person verified it, by whom and when. `count` is the number of facts returned. A page holds 200 facts unless `limit` says otherwise, up to 1,000: when a full page came back, ask for the next one with `after`.

## A person's review

Every fact is written unverified. A signed-in member of the owner's organization may mark a fact verified on the service's `/records` page, and the service records who did and when. No tool does that, and a bot never does. A review is optional: do not wait for one, and do not ask for one unless the owner wants the facts reviewed. A new value starts unverified again. Never say a fact is verified unless `list_facts` shows it.

## Views

A view is a declared list over facts: one row for each subject. Its paths are `subject`, `kind`, `now` and `facts.` followed by a key. This one lists the open records of one kind, soonest first:

```json
{"dslVersion":1,"kind":"view","id":"open-leads","version":1,"from":{"source":"facts","subject":"lead"},"where":{"eq":[{"$":"facts.stage"},"open"]},"select":["subject","facts.owner","facts.due_on"],"orderBy":"facts.due_on","limit":100}
```

A view id is lower-case words joined by hyphens. A definition is never changed: send a changed view with a higher `version`. A condition is built from `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `exists`, `and`, `or` and `not`, and dates from `addDays`, `addBusinessDays` and `diffDays`. A column with `agg` `count`, `sum`, `min` or `max` makes the service count or total.
`query_view` returns the `rows`, their `count`, and `refreshedAt` and `nowUsed`, the time the answer was computed with. A view returns 50 rows unless `limit` says otherwise, up to 200, and no sign that more exist: when as many rows came back as its limit, say that the list may be cut off. Present counts and totals only as a tool returned them; never add up rows yourself.

## Keys, limits and errors

Every `upsert_facts` needs an `idemKey`. Choose one key for each intended change and reuse it, with the same input, when retrying: the first answer comes back and nothing changes twice. `E_CONFLICT` with a message about the key means it was already used for a different request: read the facts instead of changing the payload. Do not repeat a timed-out write under a new key before reading whether it succeeded.
The service holds, for each organization, at most 10,000 subjects. One write holds at most 50 facts, each key once, and a value is at most 4,096 bytes. A count limit that was reached answers `E_CONFLICT` with a message that names it: tell the owner, and do not work around it. `E_INVALID_PAYLOAD` means the input does not fit the tool's schema. `E_NOT_FOUND` means the view, or a fact's source document, is not stored. `E_ORG_NOT_READY` means the organization's storage is not ready yet: try again later, and keep nothing on this computer meanwhile. `E_UNAUTHENTICATED` means the connection is not signed in, and `E_FORBIDDEN` means its credential may not use this tool for an organization: for either, follow the `connect` guide of the `ambitious-getting-started` skill.

## Records an earlier template kept on this computer

Templates before 0.5.0 kept typed records in the `ambitious-records` module's database on this computer. That data stays where it is and stays readable with that module's `type list`, `query` and `history` commands. Nothing moves by itself. When the owner wants a record carried over, read it with the module, agree the kind and the keys with the owner, and write it as facts through the tools above. Add nothing new there, and never edit a module's database.
Template 0.5.0 kept typed records on the service through earlier tools of the connection, which this bot's instructions no longer name. Call none of them. The tools above do not read what was kept that way. When the owner wants such a record carried over, the owner reads it on the service's `/records` page and says what to enter.

Read every tool result, and relay its error code and message on failure. Never place credentials in a fact: the service refuses text that holds a private key or a known kind of API key, and that refusal is not the only guard.
