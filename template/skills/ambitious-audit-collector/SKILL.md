---
name: ambitious-audit-collector
description: For the Ambitious Bot only. Gather a collector document for ambitious-audit from the account the bot can see, and say honestly what it could not see. Use when the Ambitious Bot collects an audit or a snapshot.
---

# Audit collector

Build the JSON document that `ambitious-audit snapshot` stores. Use only the bot's own tools. Do not read another program's private files, and do not put a conversation transcript in any field. Every text field is short: evidence text is at most 280 characters.

Include `schemaVersion` 1, `collectedAt` as UTC, the account kind (`owner`, `guest` or `team`) and a short label, then the bots, routines, connectors, task counts and page counts that the tools actually returned.

`visibility` must contain exactly one entry for each of `transcripts`, `usage`, `otherBots` and `auditLog`. Set `seen` from what the tool call did, and `why` in one sentence. If a tool was missing or refused, `seen` is false and `why` says so. Do not leave a signal out.

`evidence` entries use ids `ev-1`, `ev-2`, and so on. Point `source` at the bot id, routine id, connector name or tool the line came from, so a later finding can cite it.

Write the document to a file outside the bot's private data directory and pass it with `--in`.
