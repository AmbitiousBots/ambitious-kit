---
name: ambitious-capability-probe
description: For the Ambitious Bot only. Return observed audit visibility. Use before an Ambitious Bot audit or snapshot, and after an account, role, connector or computer change.
---

Template version: 0.4.7

# Capability probe

Use available read-only Grok Bot tools. Never read Grok internals or private backing files, and never ask a module to discover account access.
Do not read `/home/box/agent-data`, the bot's private data directory, and put nothing from there into the result or any module input.
Do not request broader permissions, edit another bot, or send data while probing.

Read what to inventory and when a signal is seen; `guide connection` finds the monitoring connection.

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide probe --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Keep the inventory locally under `AMBITIOUS_HOME`; a snapshot adds it to the review Page only when `review-page` says due.

Hard rules:

- Use `owner`, `guest` or `team` only when an account tool reports that role or the account holder has stated it; otherwise record `unknown`. Never infer a role, and do not put the audit off: the audit then answers with `mode` `partial`.
- `seen` is true only for what a tool actually returned across the requested scope; partial, denied, unavailable, failed and untested access is `false`. A value no tool returned is `null`, never zero.
- Identify the monitoring connection by the tools the connector offers, never by its display name. The probe only reads tool names; it does not call `send_report` or `send_feedback`. Call `server_info` only when this bot's instructions allow calling `server_info`.
