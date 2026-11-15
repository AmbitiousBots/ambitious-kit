---
name: ambitious-audit-collector
description: For the Ambitious Bot only. Gather a collector document for ambitious-audit from the account the bot can see, write every unseen value as null, and say honestly what it could not see. Use when the Ambitious Bot collects an audit or a snapshot.
---

Template version: 0.2.2

# Audit collector

Build the JSON document that `ambitious-audit snapshot` stores. Use only the bot's own tools. Nothing read from `/home/box/agent-data`, the bot's private data directory, may go into this document. Do not put a conversation transcript in any field. Every text field is short: evidence text is at most 280 characters.

## Ask the module what it accepts

The installed module is the authority on the document's shape. Run `ambitious-audit schema` and build the document from the collector schema it prints: its fields, allowed values, limits and the list of visibility signals. Run it again whenever you are unsure, instead of guessing a field or a value.
When `snapshot` answers `E_INPUT_SCHEMA`, the error names the failing field and the rule it broke. Correct that field from what you observed; never change a value just to make the error go away.
If the installed version has no `schema` command, it is older than 0.2.0 and cannot hold an unseen value or an unknown role. With that version, run `snapshot` only when every required value was really observed. Otherwise do not run it, and say in the audit Page that module findings need audit 0.2.0 or later.

## Unseen is null, never zero

Write a value only when a tool returned it. A value you could not observe is `null`. Zero means you observed that there were none. Never write zero, an estimate or a guess for something unseen.
Every `null` needs its reason: the visibility entry that covers that group of values has `seen` false and a `why` in one sentence. The module rejects a document where a `null` has no such entry, and the report shows every unseen entry.

- Bots and routines: list the ones the tools returned. A last-active time, a routine count or a last-run time that the tools did not show is `null`.
- Task counts come only from the output of the `ambitious-tasks` module. When that module is not installed or its output was not read, every task count is `null`.
- Page counts are `null` when the Page list could not be read.
- Usage is written as the platform reports it, with its `unit`: `credits`, or `percent` when the platform shows shares. Never convert one into the other. Usage that was not observed is `null`. The `usage` signal counts as seen only when usage by bot and usage by routine were both observed for the period, in either unit.
- Connector status is the status the platform shows, including `needsGrant` for a connector this bot has not been given access to and `initializing` for one still being set up.

## The account role

Set `account.kind` to `owner`, `guest` or `team` only when an account tool reports that role. Otherwise set it to `unknown`. Never infer a role from what the bot can see.
An unknown role does not stop the audit. The module then runs in its partial mode: it withholds or marks every finding and recommendation that depends on the role, and the report states that the role is unknown. Collect and run `snapshot` as usual.

## Visibility and evidence

`visibility` contains exactly one entry for each signal the schema lists, taken from the `ambitious-capability-probe` skill. Set `seen` from what the tool call did, and `why` in one sentence. If a tool was missing or refused, `seen` is false and `why` says so. Do not leave a signal out.
`evidence` entries use ids `ev-1`, `ev-2`, and so on. `source` is optional: when you know it, point it at the bot id, routine id, connector name or tool the line came from, so a later finding can cite it.

Write the document to a file under `AMBITIOUS_HOME` (by default `/workspace/ambitious`) and pass it with `--in`.
