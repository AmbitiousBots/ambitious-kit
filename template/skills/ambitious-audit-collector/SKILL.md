---
name: ambitious-audit-collector
description: For the Ambitious Bot only. Gather a collector document for ambitious-audit from the account the bot can see, write every unseen value as null, and say honestly what it could not see. Use when the Ambitious Bot collects an audit or a snapshot.
---

Template version: 0.2.5

# Audit collector

Build the JSON document that `ambitious-audit snapshot` stores. Use only the bot's own tools. Do not read another program's private files, and do not put a conversation transcript in any field. Every text field is short: evidence text is at most 280 characters.

When unsure about a field, run `ambitious-audit schema`. It prints the full schema with a description of every field. If `snapshot` refuses the document, each error names the field as a JSON pointer and the rule it broke; fix those fields and run it again.

## Fields

Each object takes exactly the fields listed for it. `[]` after a name means each entry of that list. Every field is required unless it is listed as optional.

- The document: `schemaVersion`, `collectedAt`, `account`, `bots`, `routines`, `connectors`, `tasks`, `pages`, `visibility`, `evidence`
- `account`: `kind`, `label`
- `bots[]`: `id`, `name`, `lastActiveAt`, `routineCount`, `usage`
- `routines[]`: `id`, `botId`, `schedule`, `state`, `lastRunAt`, `usage`; optional `lastError`
- `bots[].usage`, `routines[].usage`: `unit`, `amount7d`
- `connectors[]`: `name`, `status`
- `tasks`: `open`, `stale7d`, `blocked`
- `pages`: `count`, `updated7d`
- `visibility[]`: `signal`, `seen`, `why`
- `evidence[]`: `id`, `kind`, `text`, `source`

These fields take only the values listed:

- `schemaVersion`: `1`
- `account.kind`: `owner`, `guest`, `team`, `unknown`
- `routines[].state`: `active`, `paused`, `failing`
- `bots[].usage.unit`, `routines[].usage.unit`: `credits`, `percent`
- `connectors[].status`: `ok`, `needsAuth`, `needsGrant`, `initializing`, `error`
- `visibility[].signal`: `transcripts`, `usage`, `otherBots`, `auditLog`, `accountRole`, `tasks`, `pages`, `botActivity`, `routines`
- `evidence[].kind`: `excerpt`, `count`

## Write what was observed, and null for the rest

Include `schemaVersion` 1, `collectedAt` as UTC, the account, then the bots, routines, connectors, task counts and page counts that the tools actually returned.

A value no tool returned is `null`. Never write 0 for it, and never estimate.

- `account.kind` is `owner`, `guest` or `team` only when a tool reported the role or the account holder stated it. Otherwise write `unknown`. Do not work the role out from what the bot can or cannot do. The audit still runs with `unknown`.
- `tasks.open`, `tasks.stale7d` and `tasks.blocked` come from `ambitious-tasks counts`. Run it with `{ "list": "..." }`, naming the task list the audit covers, and copy `data.open`, `data.stale7d` and `data.blocked` as returned. Do not count tasks from `list` or `board` output, and do not add the counts of several lists together: when the work is in more than one list, take the list the owner named for the audit and say in the `tasks` signal's `why` which list was counted. If the module is not installed, the command was not run or it failed, all three are `null`.
- `pages.count` and `pages.updated7d` are `null` when the page tool did not return them.
- `lastActiveAt` on a bot and `lastRunAt` on a routine are a UTC time, the word `never` when the account shows it has not happened yet, or `null` when the account does not show it.
- `routineCount` on a bot is `null` when it was not shown.
- `usage` on each bot and each routine is `{ "unit": "credits", "amount7d": 412.5 }` when the account reports credits, `{ "unit": "percent", "amount7d": 82.5 }` when it reports a share of the total, or `null` when it reports neither for that bot or routine.
- `connectors` holds this bot's own connectors, as its connector list shows them. A connector's `status` is `ok`, `needsAuth`, `needsGrant`, `initializing` or `error`, as the list shows it.

## Visibility

`visibility` must contain exactly one entry for each of `transcripts`, `usage`, `otherBots`, `auditLog`, `accountRole`, `tasks`, `pages`, `botActivity` and `routines`. Set `seen` from what the tool call did, and `why` in one sentence. If a tool was missing or refused, `seen` is false and `why` says so. Do not leave a signal out.

Every `null` needs its signal set to `seen: false`: `accountRole` for an unknown role, `tasks` and `pages` for their counts, `botActivity` for `lastActiveAt`, `routines` for `routineCount` and `lastRunAt`, and `usage` for usage. `usage` is seen only when usage was read for every listed bot and every listed routine.

## Evidence

`evidence` entries use ids `ev-1`, `ev-2`, and so on. Every entry has a `kind`: `excerpt` when `text` is a short quote, `count` when it is a number with its unit. Point `source` at the bot id, routine id or connector name the line is about, or `tasks` for task counts, so a finding about that thing can cite it. A recommendation is only made when its finding has evidence.

```json
{ "id": "ev-1", "kind": "count", "text": "2 open tasks have not changed in 7 days.", "source": "tasks" }
```

Write one evidence line for each connector whose status is `needsAuth` or `needsGrant`, with `source` set to exactly the connector's `name`. Advice about the bot's own connectors is given even when the role is `unknown`, but only for connectors that have such a line.

## When nothing was observed

This is the smallest document `snapshot` accepts: no tool returned anything and the role is `unknown`. Start from it and replace only what a tool returned, setting that signal's `seen` to true.

```json
{
  "schemaVersion": 1,
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
