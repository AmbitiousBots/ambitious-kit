---
name: ambitious-getting-started
description: For the Ambitious Bot only. Ask three setup questions, check observable capabilities, and write the first audit as a Grok Bot Page. Use on the Ambitious Bot's first chat, after the module sync.
---

Template version: 0.2.2

# Getting started

On first chat, run the sync command from the `ambitious-module-installer` skill first. Explain any problem it reports without blocking the setup conversation.
Ask these three questions, using any answers the owner already gave instead of asking again.

1. What does your business do, and what would you like help with?
2. What do your bots do today, and which work should this audit cover?
3. Would you like monitoring, yes or no, and is there an optional consultant email you want recorded for review?

Then ask for the owner's time zone, and set every routine's schedule to it; until the owner answers, routines run in UTC.
Record the answers and the time zone in the setup section of the first audit Page. Do not send anything to the optional email.
A yes records interest in monitoring. It does not authorize a subscription, a connection, a routine or a data transfer.

## First audit Page

Run the `ambitious-capability-probe` skill. Record the observed role and scope, capability inventory and audit `visibility` array.
When no tool reports the account role, record it as `unknown` and carry on: the first audit runs in the audit module's partial mode, and the Page states that the role is unknown. Do not put the audit off for that reason, and do not ask the owner to guess.
If the sync reported the audit module installed with its selfcheck ok, follow the `ambitious-audit-collector` skill to pass observed JSON into `/workspace/ambitious/bin/ambitious-audit` (under `AMBITIOUS_HOME` when that variable is set).
Use the `ambitious-audit-page` skill to write the first audit Page, taking findings, recommendations and every reported number from successful module output.
Write every value you could not observe as `null`, never as zero or a guess. When unsure what the collector accepts, run `ambitious-audit schema` and follow the schema it prints.
If the installed audit module has no `schema` command, it cannot hold an unseen value: when a required value was not observed, skip the module run and explain in the Page that module findings need a newer audit module.
When the audit module is unavailable or an audit cannot run, still create the first audit Page with the setup answers, observed capabilities, visibility gaps and an explanation that module-backed findings and metrics are unavailable.
Do not fabricate snapshot identifiers, recommendations, counts, scores or a passing audit.

The Page contains the scope, setup choices, observations, unseen signals, available module results and next actions.
Keep tool evidence references with observations and module version and returned metadata with results. Include no secrets or full transcripts.
Return the actual Page link after creation succeeds. If Page writing is unavailable, state that the Page could not be created and which access is needed; do not claim a file or a chat message is the Page.

## Monitoring choice

For no, leave monitoring off. The owner can return to the audit Page without sending a report.
For yes, inspect whether the account already has an authenticated monitoring connection through available tools. Never infer that a copied template inherited a usable connection.
The Ambitious MCP server is `https://ambitiousbots.com/api/mcp`; sending reports through it is for Ambitious subscribers. Besides `send_report` and `send_feedback` it serves the Factory tools `factory_environment`, `factory_match`, `factory_plan` and `factory_version`, described in the bot instructions. If the connection is missing or requires sign-in, explain that the owner must add or authenticate it through the platform's supported connection flow. Do not connect a production endpoint or collect credentials yourself.
Record monitoring as pending until the required modules, connection and owner's routine choice are in place.
When monitoring actually starts, record the start time and the owner's time zone, then turn on the paused `ambitious-snapshot` routine with the owner: daily for the first 7 days, then weekly.
Before any report or feedback leaves, follow the tool-approval boundary in the bot instructions. A review or setup answer never substitutes for it.
