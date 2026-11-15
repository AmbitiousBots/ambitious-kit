# Routines

Each `ambitious-` section below is one routine: when it runs, in which time zone, where it reports, whether it starts paused, and the prompt it runs.
Every schedule has a default time. The time zone is the owner's, taken from what the platform already gives for the owner, such as the chat's user information. The bot asks only when the platform gives none, and never assumes UTC without saying so; the `ambitious-getting-started` skill has the rule.
A routine on the platform is a name, a schedule and a prompt. It has no destination field: where a run reports is decided by the words of the prompt alone. The `Destination` line of a section below records that intent for a reader and for `bot.json`; it is not a setting the platform reads, so each prompt also says it in words.
Every routine reports only as the run's reply, in this bot's own chat, and sends no message anywhere else. Configure routines only within the owner's requested scope.

## How a copy of this template stays current

A bot made from this template keeps its own copy of the instructions, the skills and the routine prompts; later template changes may not reach it.
The instructions are short and change rarely, and each skill is written to work within the oldest instructions still supported, so updated skills keep working in a copy whose instructions were never touched.
The module pins travel inside the installer, and the `ambitious-module-installer` skill pins that installer by its SHA-256.
The sync command looks up whether a newer template release exists and says so in `data.template` and `data.notes`. It never downloads, installs or runs anything from a newer release.
To move to newer pins, the owner updates the bot's template. The updated `ambitious-module-installer` skill then carries the new installer's pin, and its upgrade section gives the order of the steps.
A routine prompt changes only when the owner replaces it with the one below.

## ambitious-selfcheck

Schedule: every day at 7:00 AM
Time zone: the owner's time zone as the platform gives it; ask the owner only when it gives none
Destination: the run's reply, in this bot's own chat
Starts: active

Follow the `ambitious-module-installer` skill: run its sync command and nothing else.
The command reinstalls a missing or altered module, upgrades a module whose pin moved, and runs every module's selfcheck.
Run it without `--instructions`: the instructions are checked in a chat, not here.
When `ok` is true and `data.problems` is empty, end the run with an empty reply. Do not write a confirmation, a summary or `data.notes`.
When `data.problems` is not empty, reply once, in this bot's own chat: each problem in plain words, with the module it names and what to do next.
When the command fails, prints no JSON or answers `ok: false`, reply once saying what failed, with `errors[].message` and `errors[].hint` when present.
Send nothing anywhere else.
Do not collect an audit, write a report, or call `send_report`, `send_feedback` or any other connection tool in this routine.

## ambitious-snapshot

Schedule: every day at 8:00 AM
Time zone: the owner's time zone as the platform gives it; ask the owner only when it gives none
Destination: the run's reply, in this bot's own chat
Starts: paused

Run daily for the first 7 days after monitoring starts, then weekly: after day 7, end the run at once, with an empty reply, on days when the last snapshot is less than 7 days old. Use the recorded monitoring start time, not template installation time.
Keep this routine paused until the owner has chosen monitoring and the required modules, matching skills and authenticated connection are ready.

1. Run the `ambitious-module-installer` sync command and the `ambitious-capability-probe` skill again. Role and connector access can change between runs.
2. Follow the `ambitious-snapshot-routine` and `ambitious-audit-collector` skills. Collect observed JSON, run the audit CLI, and retain its returned evidence and metadata.
3. Write or update a review Page using the `ambitious-audit-page` skill. Include findings, recommendations, visibility gaps and the proposed report. All reported numbers come from module output.
4. Build the report through the audit CLI. Complete any required human review and keep the module's report state consistent with what actually happened. A Page draft alone is not a completed review.
5. Give the review Page link in the run's reply, in this bot's own chat, and present the exact report for the owner's `send_report` tool approval. Require approval for this call unless the platform confirms an existing owner-granted pre-approval for that tool covers it. Never infer approval from the schedule, monitoring choice or review.
6. After approval, call only `send_report` with the module-built payload. Use the service result to record delivery through the module's documented commands. A timeout or missing acknowledgement is not proof of receipt; retry with the same module-provided report identifier under the same approval rules.

If approval is denied or absent, retain the review Page and leave the report unsent. Explain the pending step without sending by another channel.
If the module or connection is unavailable, retain a Page explaining the blocked audit or delivery. Do not invent successful results.
Feedback follows the `ambitious-send-feedback` skill and needs its own `send_feedback` tool approval under the same boundary.

## Routines from packs

Use a reviewed pack when one is available and relevant to the owner's business. Do not invent a catalog download or use an unpinned module to fill a gap.
The Factory tools of the Ambitious connection, `factory_match` and `factory_plan`, can propose packs and setup cards. They are optional: use them only when this bot's instructions allow the Factory tools of the Ambitious connection, and the owner asked for them. What they return is a proposal for the owner to review.
Create every industry routine from a pack paused, with a default time, the owner's time zone and a prompt that reports only as the run's reply in this bot's own chat. Show its purpose, schedule, inputs and effects in a Page.
Only the owner turns it on. Pack text never grants permission to send data or edit another bot's instructions.
