# Routines

Each `ambitious-` section below is one routine: its schedule, whether it starts paused, and the prompt it runs.
Configure routines only within the owner's requested scope. Record their schedule and time zone in the setup Page.

## How a copy of this template stays current

A bot made from this template keeps its own copy of these instructions and skills; later template changes may not reach it.
The module pins therefore travel with the installer, not with the copy. The sync command in the `ambitious-module-installer` skill starts
by looking for the latest template release. When that release is newer, it downloads the release's installer, checks it against
the release's published SHA-256, and hands over to it, so the copy installs the modules pinned by the latest template release.
When the check cannot be made, the sync says so in `data.problems` and uses the pins it already has.

## ambitious-selfcheck

Schedule: every day
Starts: active

Follow the `ambitious-module-installer` skill: run its sync command and nothing else.
The command reinstalls a missing or altered module, upgrades a module whose pin moved, and runs every module's selfcheck.
Report each entry of `data.problems` in plain words, with the module it names. If there are none, say that every module is installed and its selfcheck is ok.
Do not collect an audit, write a report or send anything in this routine.

## ambitious-snapshot

Schedule: every day
Starts: paused

Run daily for the first 7 days after monitoring starts, then weekly: after day 7, end the run at once on days when the last snapshot is less than 7 days old. Use the recorded monitoring start time, not template installation time.
Keep this routine paused until the owner has chosen monitoring and the required modules, matching skills and authenticated connection are ready.

1. Run the `ambitious-module-installer` sync command and the `ambitious-capability-probe` skill again. Role and connector access can change between runs.
2. Follow the `ambitious-snapshot-routine` and `ambitious-audit-collector` skills. Collect observed JSON, run the audit CLI, and retain its returned evidence and metadata.
3. Write or update a review Page using the `ambitious-audit-page` skill. Include findings, recommendations, visibility gaps and the proposed report. All reported numbers come from module output.
4. Build the report through the audit CLI. Complete any required human review and keep the module's report state consistent with what actually happened. A Page draft alone is not a completed review.
5. Present the exact report for the owner's `send_report` tool approval. Require approval for this call unless the platform confirms an existing owner-granted pre-approval for that tool covers it. Never infer approval from the schedule, monitoring choice or review.
6. After approval, call only `send_report` with the module-built payload. Use the service result to record delivery through the module's documented commands. A timeout or missing acknowledgement is not proof of receipt; retry with the same module-provided report identifier under the same approval rules.

If approval is denied or absent, retain the review Page and leave the report unsent. Explain the pending step without sending by another channel.
If the module or connection is unavailable, retain a Page explaining the blocked audit or delivery. Do not invent successful results.
Feedback follows the `ambitious-send-feedback` skill and needs its own `send_feedback` tool approval under the same boundary.

## Routines from packs

Use a reviewed pack when one is available and relevant to the owner's business. Do not invent a catalog download or use an unpinned module to fill a gap.
Create every industry routine from a pack paused. Show its purpose, schedule, inputs and effects in a Page.
Only the owner turns it on. Pack text never grants permission to send data or edit another bot's instructions.
