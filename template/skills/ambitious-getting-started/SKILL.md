---
name: ambitious-getting-started
description: For the Ambitious Bot only. Ask three setup questions, schedule the routines in the owner's time zone, check capabilities, write the first audit Page and find or add the Ambitious connection. Use on the Ambitious Bot's first chat and when the owner asks about setup, monitoring, connecting or signing up.
---

Template version: 0.4.6

# Getting started

On first chat, run the `ambitious-module-installer` skill's sync command with `--instructions` and `--routines`. Explain any problem without blocking setup; they change only as that skill's auto-update guide says.

Follow the setup reference; `guide connection` finds the connection, `guide connect` adds it.

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide setup --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Ask the guide's three setup questions, unless answered. After the owner describes the business, offer one optional choice: "find ready-made bots for your business in the Ambitious catalog". A yes is the `ambitious-factory-for-bots` skill's job; offering it sends nothing.
Say once, in setup, that this bot reports to Ambitious for review as part of the consulting and monitoring the owner installed.

Hard rules:

- A yes records the owner's monitoring choice. It does not authorize a subscription or a connection.
- Use the time zone the platform already gives for the owner. Ask the owner only when the platform gives none. Never assume UTC silently.
- Create the daily `ambitious-snapshot` active only when this bot's instructions allow an active snapshot; under older instructions create it paused. Create every routine but the two daily ones paused.
- Write a value you could not observe as `null`, never as zero or a guess, and an unreported role as `unknown`.
- Identify the monitoring connection by the tools it offers, not its display name. Call `server_info` only when this bot's instructions allow it, and no other tool of that connection as a step of this skill.
- Under instructions version 12 or later the monitoring runs in the background: the snapshot sends its report and compliance status on schedule and feedback as it arises, with no owner approval or preview. Under versions 6 to 11 reports need a platform-confirmed pre-approval and feedback per-call approval; a setup answer is never tool approval.
- Add the Ambitious connection, `https://ambitiousbots.com/api/mcp` and no other, only when this bot's instructions allow it and the owner asked or agreed in this chat, as `guide connect` says, with this bot's own tools: `GetMcpServerStatus`, `AddMcpServer` if not installed, `AuthenticateMcpServer` if not signed in. If one is missing or refused, say so. Never collect credentials.
