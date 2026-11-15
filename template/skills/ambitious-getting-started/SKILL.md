---
name: ambitious-getting-started
description: For the Ambitious Bot only. Ask three setup questions, set the routines to the owner's time zone, check observable capabilities, write the first audit as a Grok Bot Page, and find the monitoring connection by its tools. Use on the Ambitious Bot's first chat, after the module sync, and when the owner asks the Ambitious Bot about setup or monitoring.
---

Template version: 0.2.6

# Getting started

On first chat, run the sync command from the `ambitious-module-installer` skill first, with `--instructions` and `--routines` as its "Check the instructions" and "Check the routines" sections say. Explain any problem it reports without blocking the setup conversation.
When it reports `instructions-out-of-date` or `instructions-custom`, follow that section: write the Page with the proposed text, what pasting it changes in what the bot may do, and a short diff, and say in this chat that pasting it is the owner's choice. Never change the instructions yourself.
When it reports a problem that starts with `routine-`, follow "Check the routines" there: write the "Proposed routines" Page and say in this chat what differs. Never change a routine because of the check. Setup carries on either way, because these skills work with the instructions as they are.
Ask these three questions, using any answers the owner already gave instead of asking again.

1. What does your business do, and what would you like help with?
2. What do your bots do today, and which work should this audit cover?
3. Would you like monitoring, yes or no, and is there an optional consultant email you want recorded for review?

Record the answers in the setup section of the first audit Page. Do not send anything to the optional email.
A yes records interest in monitoring. It does not authorize a subscription, a connection, a routine or a data transfer.

## Time zone

Schedule every routine in the owner's time zone.
Use the time zone the platform already gives for the owner: the one in the chat's user information, or the one this bot's environment states for the owner. Do not ask for what is already known; say which zone you used and where it came from, so the owner can correct it.
Ask the owner only when the platform gives none. A computer clock that runs in UTC does not show that the owner is in UTC.
Never assume UTC silently. Until a time zone is known, say plainly that the routine times are not yet in the owner's time zone and which zone they run in meanwhile, and ask again at the next chat.
Record the time zone and where it came from in the setup section of the first audit Page.

## Routines

A routine on the platform is a name, a schedule and a prompt. It has no separate setting for where a run reports: the prompt says it in words, and a run's reply appears in this bot's own chat.
The `ambitious-selfcheck` routine runs the plain sync command every day at 7:00 AM. Its reply is empty when `data.problems` is empty, and lists the problems when it is not.
The `ambitious-snapshot` routine, every day at 8:00 AM, stays paused until the owner chooses monitoring; it follows the `ambitious-snapshot-routine` skill.
Create every other routine paused and let the owner turn it on.

## First audit Page

Run the `ambitious-capability-probe` skill. Record the observed role and scope, capability inventory and audit `visibility` array.
When no tool reports the account role and the owner has not stated it, record it as `unknown` and carry on: the audit module then answers with `mode` `partial`, and the Page states that the role is unknown. Do not put the audit off for that reason, and do not ask the owner to guess.
If the sync reported the audit module installed with its selfcheck ok, follow the `ambitious-audit-collector` skill to pass observed JSON into `/workspace/ambitious/bin/ambitious-audit` (under `AMBITIOUS_HOME` when that variable is set).
Use the `ambitious-audit-page` skill to write the first audit Page, taking findings, recommendations and every reported number from successful module output.
Write every value you could not observe as `null`, never as zero or a guess. When unsure what the collector accepts, run `ambitious-audit schema` and follow the schema it prints.
When the audit module is unavailable or an audit cannot run, still create the first audit Page with the setup answers, observed capabilities, visibility gaps and an explanation that module-backed findings and metrics are unavailable.
Do not fabricate snapshot identifiers, recommendations, counts, scores or a passing audit.

The Page contains the scope, setup choices, observations, unseen signals, available module results and next actions.
Keep tool evidence references with observations and module version and returned metadata with results. Include no secrets or full transcripts.
Return the actual Page link after creation succeeds. If Page writing is unavailable, state that the Page could not be created and which access is needed; do not claim a file or a chat message is the Page.

## Monitoring choice

For no, leave monitoring off. The owner can return to the audit Page without sending a report.
For yes, look for the monitoring connection through the available connector tools. Never infer that a copied template inherited a usable connection.

### Find the monitoring connection

Identify the monitoring connection by the tools the connector offers, never by its display name. The platform's connector list may show no server address, so do not wait for one and do not guess one.

1. Tool names. The monitoring connection is a connector whose tool list includes all three of `server_info`, `send_report` and `send_feedback`. Write every connector's name and tool names, as the connector list shows them, to `connectors.json` under `AMBITIOUS_HOME`, never under `/home/box/agent-data`, and ask the installer:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" connection --json --in "${AMBITIOUS_HOME:-/workspace/ambitious}/connectors.json"
```

`connectors.json` is a list of `{ "name", "tools", "serverInfo" }`. `tools` is the list of tool names, or `null` when the connector list shows no tools for that connector. `serverInfo` is `null` until step 2.

2. Identity. `server_info` takes no arguments and returns the service's fixed identity. Call it only when this bot's instructions allow calling `server_info`, on a connector that passed step 1, with whatever tool approval the platform asks of the owner. Put the object it returned in that connector's `serverInfo` and run the command again: the `identity` it returned must be exactly `ambitiousbots.com/mcp/v1`.

Instructions that let nothing leave this computer except through `send_report` and `send_feedback` do not allow step 2. The call carries no arguments and no account or business data, but it is still a call to the service through a third tool, and the service can see that this connection made it. Under those instructions skip step 2, go by the tool names alone, and tell the owner that the connection was identified by its tool names and that its identity was not confirmed. Monitoring works either way.

| `data.connectors[].kind` | `identity` | Meaning |
| --- | --- | --- |
| `monitoring` | `confirmed` | It has the three tools and answered with the service's identity. |
| `monitoring` | `not confirmed` | It has the three tools and `server_info` was not called. Say so. |
| `different` | `mismatch` | It has the three tools but answered with another identity. Send it nothing. |
| `different` | `null` | It lacks one of the three tools. |
| `unidentified` | `null` | The connector list shows no tools for it, so nothing can be said. |

`data.monitoring` is the name of the one monitoring connection, or `null` when there is none or more than one. Relay every line of `data.tellOwner`.
A connector that fails both checks is "a different connector", whatever it is called, even when it is named Ambitious or anything like it. Report it as "a different connector" with its name, and leave it alone: do not use it for monitoring, sign in to it, change it or remove it.
A confirmed identity means the server answered with the service's identity string. It does not prove who runs that server, since any server can return the same string. The address in the connector's own settings, which the owner can open, shows where reports go: for the Ambitious service it is `https://ambitiousbots.com/api/mcp`.
If there is no monitoring connection, or it needs a sign-in, explain that the owner adds or signs in to it through the platform's connection flow. Do not connect a production endpoint or collect credentials yourself.
The installer writes worked examples of this check to `template/fixtures/ambitious-connection` under `AMBITIOUS_HOME`.

Sending reports through the monitoring connection is for Ambitious subscribers. Its tools for that are `send_report` and `send_feedback`.
No step of this skill uses another tool of that connection, whatever tools it lists. Do not call one, and say so if asked.
Record monitoring as pending until the required modules, connection and owner's routine choice are in place.
When monitoring actually starts, record the start time and the owner's time zone, then turn on the paused `ambitious-snapshot` routine with the owner: daily for the first 7 days, then weekly.
Before any report or feedback leaves, review the exact payload with the owner and get the owner's tool approval for that call. A review or setup answer never substitutes for it.
