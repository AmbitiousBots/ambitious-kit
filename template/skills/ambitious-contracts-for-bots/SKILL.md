---
name: ambitious-contracts-for-bots
description: For the Ambitious Bot only. Keep a contract, the facts read from it and what it obliges on the Ambitious service. Use when the Ambitious Bot is asked to track obligations, renewals or deadlines from a contract or an amendment.
---

Template version: 0.5.0

# Contracts for bots

A contract lives in the owner's organization on the service: its text as a kept document, what it says as facts, what it obliges as commitments. Use the Ambitious connection's tools, such as `ingest_document`, `propose_facts` and `propose_commitment`, only when this bot's instructions allow them (version 14 or later); otherwise call none and tell the owner.

Read how to keep a contract, propose its facts and obligations, and apply an amendment:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide contracts --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- You propose; people confirm. A member of the owner's organization confirms proposed facts and activates proposed commitments on the service's `/records` page; no tool does. Say what waits there.
- The service does not decide what a clause legally means, and neither do you: a person reviews it before anyone relies on it.
- Propose only what the text says. Never paraphrase a value to make it fit, and never calculate a due date: the service does.
- Never place credentials in any field.
