---
name: ambitious-getting-started
description: For the Ambitious Bot only. Ask three setup questions, set the routines to the owner's time zone, check observable capabilities, write the first audit as a Grok Bot Page, and find the monitoring connection by its address. Use on the Ambitious Bot's first chat, after the module sync, and when the owner asks the Ambitious Bot about setup or monitoring.
---

Template version: 0.2.5

# Getting started

On first chat, run the sync command from the `ambitious-module-installer` skill first, with `--instructions` as its "Check the instructions" section says. Explain any problem it reports without blocking the setup conversation.
When it reports `instructions-out-of-date` or `instructions-custom`, follow that section: write the Page with the proposed text and a short diff, and say in this chat that pasting it is the owner's choice. Never change the instructions yourself. Setup carries on either way, because these skills work with the instructions as they are.
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

The monitoring connection is the connector whose server address is exactly `https://ambitiousbots.com/api/mcp`. Identify it by that address and never by its display name.
A connector that is named Ambitious, or anything like it, but has another address is a different connector. Report it as "a different connector", with its name and address, and leave it alone: do not use it for monitoring, sign in to it, change it or remove it.
When the connector list does not show addresses, say that the monitoring connection could not be identified, and ask the owner to check the address in the connector's settings. Do not go by the name.
If no connector has that address, or the one that has it needs a sign-in, explain that the owner adds or signs in to it through the platform's connection flow. Do not connect a production endpoint or collect credentials yourself.

Sending reports through the monitoring connection is for Ambitious subscribers. Its tools for that are `send_report` and `send_feedback`.
The same server also offers the Factory tools `factory_environment`, `factory_match`, `factory_plan` and `factory_version`. They are optional and no step of this skill needs them. Use a Factory tool only when this bot's instructions allow tools of the Ambitious connection other than `send_report` and `send_feedback`, and the owner asked for that help; show what it returned in a Page and create nothing from it without the owner's go-ahead. Under instructions that let nothing leave except through `send_report` and `send_feedback`, do not call a Factory tool, and say that the instructions do not allow it.
Record monitoring as pending until the required modules, connection and owner's routine choice are in place.
When monitoring actually starts, record the start time and the owner's time zone, then turn on the paused `ambitious-snapshot` routine with the owner: daily for the first 7 days, then weekly.
Before any report or feedback leaves, review the exact payload with the owner and get the owner's tool approval for that call. A review or setup answer never substitutes for it.
