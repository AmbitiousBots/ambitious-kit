---
name: ambitious-getting-started
description: For the Ambitious Bot only. Ask three setup questions, schedule the routines in the owner's time zone, check capabilities, write the first audit Page and find the monitoring connection. Use on the Ambitious Bot's first chat, after the module sync, and when the owner asks about setup or monitoring.
---

Template version: 0.4.1

# Getting started

On first chat, run the sync command of the `ambitious-module-installer` skill with `--instructions` and `--routines`, as its guides say. Explain any problem without blocking setup, write the proposal Page it calls for, and never change the instructions or a routine yourself.

Then read the setup reference and follow it; `guide connection` finds the monitoring connection.

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide setup --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Ask the guide's three setup questions, skipping any the owner already answered. Once the owner has described the business and what they need, offer one optional choice: "find ready-made bots for your business in the Ambitious catalog". A yes is the `ambitious-factory-for-bots` skill's job; offering it sends nothing.

Then schedule the routines, run the `ambitious-capability-probe` skill, write the first audit Page and record the monitoring choice.

Hard rules:

- A yes records the owner's monitoring choice. It does not authorize a subscription, a connection or a data transfer. Do not send anything to the optional email.
- Use the time zone the platform already gives for the owner. Ask the owner only when the platform gives none. Never assume UTC silently.
- Create the daily `ambitious-snapshot` active only when this bot's instructions allow an active snapshot; under older instructions create it paused. Create every routine but the two daily ones paused.
- Write a value you could not observe as `null`, never as zero or a guess, and an unreported role as `unknown`. Do not put the audit off for that.
- Identify the monitoring connection by the tools the connector offers, never by its display name. Call `server_info` only when this bot's instructions allow calling `server_info`, and call no other tool of that connection beyond `send_report` and `send_feedback`.
- Nothing is sent without the owner's tool approval: a routine calls `send_report` only under a pre-approval the platform confirms covers that call; `send_feedback` needs approval for each call. A setup answer is never tool approval.
- Do not connect a production endpoint or collect credentials.
