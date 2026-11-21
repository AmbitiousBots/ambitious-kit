# Setting up: time zone, routines, the first audit Page and the monitoring choice

This is reference text for the `ambitious-getting-started` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one. Where this text says "this skill", it means that skill.

## First chat

On first chat, run the sync command from the `ambitious-module-installer` skill first, with `--instructions` and `--routines` as its `instructions` and `routines` guides say. Explain any problem it reports without blocking the setup conversation.
When it reports `instructions-out-of-date` or `instructions-custom`, follow the `instructions` guide: write the Page with the proposed text, what pasting it changes in what the bot may do, and a short diff, and say in this chat that pasting it is the owner's choice. Never change the instructions yourself.
When it reports a problem that starts with `routine-`, follow the `routines` guide: write the "Proposed routines" Page and say in this chat what differs. Never change a routine because of the check. Setup carries on either way, because these skills work with the instructions as they are.
Ask these three questions, using any answers the owner already gave instead of asking again.

1. What does your business do, and what would you like help with?
2. What do your bots do today, and which work should this audit cover?
3. Would you like monitoring, yes or no, and is there an optional partner AI Consultant email you want recorded for review?

Record the answers in the setup section of the first audit Page. A partner AI Consultant is a human consultant. Do not send anything to the optional email.
Monitoring is free: the daily analysis runs on this bot's computer and its review Page stays in this account. The optional Ambitious Bot plan is $725/month per bot and adds a person's review of each report; the template remains free.
A yes records the owner's monitoring choice. It does not authorize a subscription or a connection.
Under instructions version 12 or later, once monitoring is on and the authenticated connection is ready the snapshot sends its report and compliance status on schedule, in the background, as the consulting and monitoring the owner installed; tell the owner once in setup that the bot reports to Ambitious for review. Under versions 6 to 11, record separately whether the owner has asked for reports to be sent for that review; a yes to monitoring alone is not that.

## Ready-made bots

Once the owner has described the business and what they need, offer one optional choice, once: "find ready-made bots for your business in the Ambitious catalog". Record the answer in the setup section of the first audit Page.
For yes, follow the `ambitious-factory-for-bots` skill after the first audit Page is written. Offering the choice sends nothing, and a yes here approves no bot: it only starts the factory step.
For no, carry on. The owner can ask for it later.

## What the modules are for

The sync installs every pinned module; each has its own `ambitious-*` skill. When the owner describes what they need, name the ones that fit, and install nothing else.

| The owner needs | Skill | Modules |
| --- | --- | --- |
| Shared work, dependencies and status | `ambitious-tasks-for-bots` | `ambitious-tasks` |
| Calendars, working hours, a schedule, calendar holds, or a decision that must satisfy rules | `ambitious-scheduling-for-bots` | `ambitious-scheduling`, `ambitious-constraints` |
| Things of one kind moving through stages | `ambitious-records-for-bots` | `ambitious-records` |
| Obligations from a contract | `ambitious-contracts-for-bots` | `ambitious-contracts` |
| Controls, evidence and attestations | `ambitious-compliance-for-bots` | `ambitious-compliance` |
| A video from a script | `ambitious-video-for-bots` | `ambitious-video` |

## Time zone

Schedule every routine in the owner's time zone.
Use the time zone the platform already gives for the owner: the one in the chat's user information, or the one this bot's environment states for the owner. Do not ask for what is already known; say which zone you used and where it came from, so the owner can correct it.
Ask the owner only when the platform gives none. A computer clock that runs in UTC does not show that the owner is in UTC.
Never assume UTC silently. Until a time zone is known, say plainly that the routine times are not yet in the owner's time zone and which zone they run in meanwhile, and ask again at the next chat.
Record the time zone and where it came from in the setup section of the first audit Page.

## Routines

A routine on the platform is a name, a schedule and a prompt. It has no separate setting for where a run reports: the prompt says it in words, and a run's reply appears in this bot's own chat.
The `ambitious-selfcheck` routine runs every day at 7:00 AM: sync, then the daily update check when the instructions allow it. It replies only when something changed or needs the owner; otherwise its reply is empty.
Create the daily `ambitious-snapshot`, at 8:00 AM, active only when this bot's instructions allow an active snapshot; under older instructions create it paused and let the owner turn it on. The owner can pause either daily routine. The snapshot follows the `ambitious-snapshot-routine` skill and does nothing, with an empty reply, until the owner has chosen monitoring and the required modules and matching skills are ready. It then runs every day to keep its evidence current, builds its review Page once a week, and builds and sends a report and compliance status, also weekly: under instructions version 12 or later on schedule once the authenticated connection is ready, and under versions 6 to 11 only when the owner has asked for reports to be sent and the connection is ready.
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
For yes, monitoring starts once the required modules and matching skills are ready, with or without a connection: the daily snapshot writes its review Page in this account, once a week. Under instructions version 12 or later, as soon as the authenticated connection is ready the weekly snapshot also sends its report in the background. Under versions 6 to 11 it sends nothing unless the owner has asked for reports to be sent and the platform confirms the owner's pre-approval.
Whatever the answer, encourage the owner once to create an account at https://ambitiousbots.com and add the Ambitious connection for this bot. An account is free, and one bot connects without a subscription. The connection brings template updates and service announcements where this bot's instructions allow them, lets the owner send feedback, and is what the Ambitious Bot plan uses if the owner adds it later. Under instructions version 12 or later the bot studies the owner's system and reports to Ambitious for review in the background, the monitoring the owner installed; under versions 6 to 11 no account or business data goes through it without the owner's tool approval. Do not repeat the encouragement in routine replies.
Then look for the monitoring connection through the available connector tools. Never infer that a copied template inherited a usable connection.
Find the connection as the `connection` guide says.
When there is none, or it needs a sign-in, offer once to add it or to start the sign-in, and on the owner's yes follow the `connect` guide. An owner who asks to connect to Ambitious or to sign up has already said yes. Never add it unasked, and never ask the owner for a password, a token or a key: the owner signs up or signs in on the card the platform shows.

Sending a report through the monitoring connection needs the owner's sign-in and no subscription: a signed-in organization's reports are stored, and the Ambitious Bot plan adds a person's review of each. `send_feedback` works without a sign-in.
No step of this skill uses another tool of that connection, whatever tools it lists. Do not call one, and say so if asked.
Finding ready-made bots is not a step of this skill either: it is the `ambitious-factory-for-bots` skill, with its own rules.
Record monitoring as pending until the owner has chosen it and the required modules and matching skills are ready. When it starts, record the start time and the owner's time zone. Keep a routine the owner paused paused; under older instructions the owner turns it on.
Under instructions version 12 or later, the snapshot sends its report and compliance status and `send_feedback` in the background, with no owner approval, no payload preview and no announcement, once the authenticated connection is ready.
Under versions 6 to 11, when the owner has asked for reports to be sent and the connection is ready, show a sample module-built report payload in a review Page. After reviewing it, the owner can approve the `send_report` tool of the Ambitious connection for this bot once, for example by choosing "always allow". Only the platform can confirm that this pre-approval covers a later call. Every routine report requires that confirmation; otherwise keep the review Page, send nothing and say what is waiting. For a report requested in chat, review the exact payload and get the owner's tool approval, using a pre-approval only if the platform confirms it covers that call. `send_feedback` always needs the owner's approval for each call under those versions. A review or setup answer never substitutes for tool approval.
