# The collector document

This is reference text for the `ambitious-audit-collector` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

Build the JSON document that `ambitious-audit snapshot` stores. Use only the bot's own tools. Do not read another program's private files, and do not put a conversation transcript in any field. Every text field is short: evidence text is at most 280 characters.

When unsure about a field, run `ambitious-audit schema`. It prints the full schema with a description of every field. If `snapshot` refuses the document, each error names the field as a JSON pointer and the rule it broke; fix those fields and run it again.

## Fields

Each object takes exactly the fields listed for it. `[]` after a name means each entry of that list. Every field is required unless it is listed as optional.

- The document: `schemaVersion`, `collectedAt`, `account`, `bots`, `routines`, `connectors`, `tasks`, `pages`, `visibility`, `evidence`; optional `usageOther`, `weeklyLimitUsed`, `planUsage`
- `account`: `kind`, `label`
- `bots[]`: `id`, `name`, `lastActiveAt`, `routineCount`, `usage`
- `bots[].usage`: `unit`; optional `amount7d`, `period`, `periodStart`, `periodEnd`, `share`, `shareBelow`
- `routines[]`: `id`, `botId`, `schedule`, `state`, `lastRunAt`, `usage`; optional `pausedAt`, `createdAt`, `lastError`, `runs7d`, `failedRuns7d`
- `routines[].usage`: `unit`, `amount7d`
- `connectors[]`: `name`, `status`
- `tasks`: `open`, `stale7d`, `blocked`; optional `closed7d`
- `pages`: `count`, `updated7d`
- `usageOther`: `share`; optional `botCount`
- `weeklyLimitUsed`: `percent`, `asOf`
- `visibility[]`: `signal`, `seen`; optional `why`, `scope`
- `evidence[]`: `id`, `kind`, `source`; optional `text`, `sourceKind`
- `planUsage`: `weeklyLimitUsedPercent`, `extraCreditsLeftUsdCents`, `observedAt`, `period`

These fields take only the values listed:

- `schemaVersion`: `2`
- `account.kind`: `owner`, `guest`, `team`, `unknown`
- `bots[].usage.unit`: `credits`, `percent`, `share`
- `bots[].usage.period`: `this_week`, `last_7_days`, `last_30_days`
- `routines[].state`: `active`, `paused`, `failing`
- `routines[].usage.unit`: `credits`, `percent`
- `connectors[].status`: `ok`, `needsAuth`, `needsGrant`, `initializing`, `error`
- `visibility[].signal`: `transcripts`, `usage`, `otherBots`, `auditLog`, `accountRole`, `tasks`, `pages`, `botActivity`, `routines`
- `visibility[].seen`: `true`, `false`, `partial`
- `visibility[].scope`: `all`, `shared_only`, `limited`
- `evidence[].kind`: `excerpt`, `count`
- `evidence[].sourceKind`: `bot`, `routine`, `connector`, `tasks`
- `planUsage.period`: `this_week`, `last_7_days`, `last_30_days`, `null`

## Write what was observed, and null for the rest

Include `schemaVersion` 2, `collectedAt` as UTC, the account, then the bots, routines, connectors, task counts and page counts that the tools actually returned.

A value no tool returned is `null`. Never write 0 for it, and never estimate.

- `account.kind` is `owner`, `guest` or `team` only when a tool reported the role or the account holder stated it. Otherwise write `unknown`. Do not work the role out from what the bot can or cannot do. The audit still runs with `unknown`.
- `tasks.open`, `tasks.stale7d` and `tasks.blocked` come from `ambitious-tasks counts`. Run it with `{}` to count the list named `default`, where a task added without a list goes, or with `{ "list": "..." }` to name the task list the audit covers. Read `data.exists` first. When it is `true`, copy `data.open`, `data.stale7d` and `data.blocked` as returned. When it is `false`, no task has ever been in that list, so the list was not seen: all three are `null`, the `tasks` signal is `seen: false`, and its `why` says which list was missing, from `data.list`, with the lists that do exist, from `data.note`. A list that does not exist is never a list with 0 tasks. Do not count tasks from `list` or `board` output, and do not add the counts of several lists together: when the work is in more than one list, take the list the owner named for the audit and say in the `tasks` signal's `why` which list was counted. If the module is not installed, the command was not run or it failed, all three are `null`. Work kept as commitments on the Ambitious service is not counted here: the service returns no such counts, and due work listed there is never counted by hand. When the owner's work is kept there and no list exists on this computer, say so in the `tasks` signal's `why`. `closed7d` is tasks closed in the last seven days: copy `data.done7d` from that same counts result, and leave `closed7d` out when `data.done7d` was not returned. Do not write 0 for it.
- `pages.count` and `pages.updated7d` are `null` when the page tool did not return them.
- `lastActiveAt` on a bot and `lastRunAt` on a routine are a UTC time, the word `never` when the account shows it has not happened yet, or `null` when the account does not show it.
- `routineCount` on a bot is `null` when it was not shown.
- `pausedAt` on a paused routine is the UTC time the account shows for when it was paused, and `createdAt` the UTC time it shows for when the routine was created. Leave each one out when the account does not show it: do not write `null` for it, and do not work a pause time out from the last run or from anything else.
- `runs7d` and `failedRuns7d` are how many times the routine ran in the last seven days and how many of those runs failed, when a tool reported them. Leave each one out when it was not reported, and never write 0 for it. A routine that was not observed is left out of `routines`, with the `routines` signal `seen: false`.
- `usage` on each routine is `{ "unit": "credits", "amount7d": 412.5 }` when the account reports the routine's credits for the last 7 days, `{ "unit": "percent", "amount7d": 82.5 }` when it reports a percentage of the account's usage for the last 7 days, or `null` when it reports neither for that routine.
- `usage` on each bot takes the same two forms, or the share form under "Usage reported as shares" below, or `null`.
- `connectors` holds this bot's own connectors, as its connector list shows them. A connector's `status` is `ok`, `needsAuth`, `needsGrant`, `initializing` or `error`, as the list shows it.

## Usage reported as shares

The platform's usage tool may report no credits at all, only shares: each bot's share of all bot usage in a period, for the bots that used the most, with every other bot summed in one line such as "Other bots". On Grok Bot the list holds 5 bots unless more are asked for, and at most 20, and the percentage of the weekly limit used is given only when the period is the current week.

Ask the usage tool once: the period `last_7_days`, grouped by bot, with the largest list it allows, which is 20 where that is the limit, so that as few bots as possible end up inside the summed line. If the tool does not offer `last_7_days`, ask for `this_week` or `last_30_days` and write that period instead. Then write down what it returned:

- For each bot the report lists by name: `"usage": { "unit": "share", "period": "last_7_days", "share": 0.62 }`. A share shown as 62% is written `0.62`. A share shown as less than 1% is `"shareBelow": 0.01` and `share` is left out. Give exactly one of `share` and `shareBelow`. Add `periodStart` and `periodEnd` when the report gives them. Every bot carries the same `period`, the one that was asked for.
- For the summed line: `"usageOther": { "share": 0.08, "botCount": 3 }` at the top of the document. Leave `botCount` out when the report does not say how many bots the line sums, and leave `usageOther` out when the report has no such line.
- For every bot the report did not list by name, including each bot inside the summed line: `"usage": null`. Its own share was not seen. Never write 0 for it, and never split the summed share between bots.
- When the report gives the percentage of the weekly limit used: `"weeklyLimitUsed": { "percent": 37, "asOf": "2026-01-08T00:00:00Z" }` at the top of the document, with `asOf` the UTC time it was read. A `last_7_days` report does not give it, so leave `weeklyLimitUsed` out then. Never work it out from shares.
- A report by bot says nothing per routine, so each routine's `usage` is `null`.
- When the usage report shows plan figures, add `planUsage` with `weeklyLimitUsedPercent` from 0 to 100, `extraCreditsLeftUsdCents` as whole cents (29 for 0.29), `observedAt` in UTC and `period`. Use `null` for each figure the report does not give. Leave `planUsage` out when the report has no plan figures.

When any bot or routine has `usage: null`, the `usage` signal is `seen: false`. Say in its `why` what the report did give and for which period, how many bots are only inside the summed line, and that it gives nothing per routine.

These fields show a report that listed two bots and summed a third into its other line. They replace `bots` in the document under "When nothing was observed" below, whose `usage` signal stays `seen: false`:

```json
{
  "bots": [
    { "id": "bot-1", "name": "First bot", "lastActiveAt": null, "routineCount": null, "usage": { "unit": "share", "period": "last_7_days", "share": 0.62 } },
    { "id": "bot-2", "name": "Second bot", "lastActiveAt": null, "routineCount": null, "usage": { "unit": "share", "period": "last_7_days", "share": 0.3 } },
    { "id": "bot-3", "name": "Third bot", "lastActiveAt": null, "routineCount": null, "usage": null }
  ],
  "usageOther": { "share": 0.08, "botCount": 1 }
}
```

## Visibility

`visibility` must contain exactly one entry for each of `transcripts`, `usage`, `otherBots`, `auditLog`, `accountRole`, `tasks`, `pages`, `botActivity` and `routines`. Set `seen` from what the tool call did, and `why` in one sentence. `seen` is `true` when the reading is complete, `false` when nothing was observed, and `"partial"` when it is incomplete. `scope` is `all`, `shared_only` or `limited` when the account shows that, and is left out otherwise. If a tool was missing or refused, `seen` is false and `why` says so. Do not leave a signal out.

Every `null` needs its signal set to `seen: false`: `accountRole` for an unknown role, `tasks` and `pages` for their counts, `botActivity` for `lastActiveAt`, `routines` for `routineCount` and `lastRunAt`, and `usage` for usage. `usage` is seen only when usage was read for every listed bot and every listed routine.

## Evidence

`evidence` entries use ids `ev-1`, `ev-2`, and so on. Every entry has a `kind`: `excerpt` when `text` is a short quote, `count` when it is a number with its unit. Point `source` at the bot id, routine id or connector name the line is about, or `tasks` for task counts, and set `sourceKind` to `bot`, `routine`, `connector` or `tasks`, so a finding about that thing can cite it. `text` may be left out. A recommendation is only made when its finding has evidence.

```json
{ "id": "ev-1", "kind": "count", "text": "2 open tasks have not changed in 7 days.", "source": "tasks", "sourceKind": "tasks" }
```

Write one evidence line for each connector whose status is `needsAuth` or `needsGrant`, with `source` set to exactly the connector's `name`. Advice about the bot's own connectors is given even when the role is `unknown`, but only for connectors that have such a line.

## When nothing was observed

This is the smallest document `snapshot` accepts: no tool returned anything and the role is `unknown`. Start from it and replace only what a tool returned, setting that signal's `seen` to true.

```json
{
  "schemaVersion": 2,
  "collectedAt": "2026-01-08T00:00:00Z",
  "account": { "kind": "unknown", "label": "Example account" },
  "bots": [],
  "routines": [],
  "connectors": [],
  "tasks": { "open": null, "stale7d": null, "blocked": null },
  "pages": { "count": null, "updated7d": null },
  "visibility": [
    { "signal": "transcripts", "seen": false, "why": "No tool returned conversation text." },
    { "signal": "usage", "seen": false, "why": "No tool returned usage figures." },
    { "signal": "otherBots", "seen": false, "why": "No tool listed the account's other bots." },
    { "signal": "auditLog", "seen": false, "why": "No tool returned the account's audit log." },
    { "signal": "accountRole", "seen": false, "why": "No tool reported the role and the account holder has not stated it." },
    { "signal": "tasks", "seen": false, "why": "The ambitious-tasks counts command was not run." },
    { "signal": "pages", "seen": false, "why": "The page tool returned no counts." },
    { "signal": "botActivity", "seen": false, "why": "No tool returned when a bot was last active." },
    { "signal": "routines", "seen": false, "why": "No tool listed any routines." }
  ],
  "evidence": []
}
```

Write the document to a file outside the bot's private data directory and pass it with `--in`.
