---
name: getting-started
description: Ask three setup questions, check observable capabilities, and write the first audit as a Grok Bot Page. Use on first chat, after the module sync.
---

# Getting started

On first chat, run the sync command from the `module-installer` skill first. Explain any problem it reports without blocking the setup conversation.
Ask these three questions, using any answers the owner already gave instead of asking again.

1. What does your business do, and what would you like help with?
2. What do your bots do today, and which work should this audit cover?
3. Would you like monitoring, yes or no, and is there an optional consultant email you want recorded for review?

Record the answers in the setup section of the first audit Page. Do not send anything to the optional email.
A yes records interest in monitoring. It does not authorize a subscription, a connection, a routine or a data transfer.

## First audit Page

Run the `capability-probe` skill. Record the observed role and scope, capability inventory and audit `visibility` array.
If the sync reported the audit module installed with its selfcheck ok, follow the `audit-collector` skill to pass observed JSON into `/workspace/ambitious/bin/ambitious-audit` (under `AMBITIOUS_HOME` when that variable is set).
Use the `audit-page` skill to write the first audit Page, taking findings, recommendations and every reported number from successful module output.
Do not fill missing required collector values with zero or a guess. Explain that collection is incomplete if the installed collector schema cannot represent an unknown value.
When the audit module is unavailable or an audit cannot run, still create the first audit Page with the setup answers, observed capabilities, visibility gaps and an explanation that module-backed findings and metrics are unavailable.
Do not fabricate snapshot identifiers, recommendations, counts, scores or a passing audit.

The Page contains the scope, setup choices, observations, unseen signals, available module results and next actions.
Keep tool evidence references with observations and module version and returned metadata with results. Include no secrets or full transcripts.
Return the actual Page link after creation succeeds. If Page writing is unavailable, state that the Page could not be created and which access is needed; do not claim a file or a chat message is the Page.

## Monitoring choice

For no, leave monitoring off. The owner can return to the audit Page without sending a report.
For yes, inspect whether the account already has an authenticated monitoring connection through available tools. Never infer that a copied template inherited a usable connection.
The monitoring MCP server is `https://ambitiousbots.com/api/mcp`, for Ambitious subscribers. If the connection is missing or requires sign-in, explain that the owner must add or authenticate it through the platform's supported connection flow. Do not connect a production endpoint or collect credentials yourself.
Record monitoring as pending until the required modules, connection and owner's routine choice are in place.
When monitoring actually starts, record the start time and schedule time zone, then turn on the paused `ambitious-snapshot` routine with the owner: daily for the first 7 days, then weekly.
Before any report or feedback leaves, follow the tool-approval boundary in the bot instructions. A review or setup answer never substitutes for it.
