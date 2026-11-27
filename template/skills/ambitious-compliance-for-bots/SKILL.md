---
name: ambitious-compliance-for-bots
description: For the Ambitious Bot only. Keep a register of controls, evidence and attestations on the Ambitious service. Use when the Ambitious Bot is asked to track what a program requires, record proof, or see what is missing or due.
---

Template version: 0.6.0

# Track controls and evidence

The register lives in the owner's organization on the service: controls as facts, proof as kept documents, regular proof as runs of one recipe. Use the Ambitious connection's tools, such as `add_document`, `upsert_facts` and `complete_step`, only when this bot's instructions allow them (version 15 or later); otherwise call none and tell the owner.

Read how the register is laid out and where a control stands:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide compliance --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- The register records what the owner tells it. It does not judge whether the business meets any law, standard or certification, and neither do you: report what is on record, never a compliance opinion.
- A fact is usable once written. Only a signed-in member of the owner's organization marks a fact verified or accepts proof, on the service's `/records` page; no tool does.
- A control's status comes only from the guide's rule over what the tools returned; otherwise it is `unknown`.
- Never place credentials in any field.
