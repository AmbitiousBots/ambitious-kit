---
name: ambitious-contracts-for-bots
description: For the Ambitious Bot only. Keep a contract, the facts read from it and what it obliges on the Ambitious service. Use when the Ambitious Bot is asked to track obligations, renewals or deadlines from a contract or an amendment.
---

Template version: 0.6.0

# Contracts for bots

A contract lives in the owner's organization on the service: its text as a document, its terms as facts, its obligations as a compiled recipe. Use the Ambitious connection's tools, such as `add_document`, `upsert_facts` and `compile_recipe`, only when this bot's instructions allow them (version 15 or later); otherwise call none and tell the owner.

Read how to keep a contract, write its facts, compile its recipe and apply an amendment:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide contracts --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- A fact is usable once written. Only a signed-in member of the owner's organization marks a fact verified or activates the compiled recipe, on the service's `/records` page; no tool does. Say which draft waits there.
- The service does not decide what a clause legally means, and neither do you.
- Write only what the text says. Never paraphrase a value to make it fit, and never calculate a due date: the service does.
- Never place credentials in any field.
