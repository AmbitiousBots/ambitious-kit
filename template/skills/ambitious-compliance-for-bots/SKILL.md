---
name: ambitious-compliance-for-bots
description: For the Ambitious Bot only. Keep a register of controls, evidence and attestations on the Ambitious service. Use when the Ambitious Bot is asked to track what a program requires, record proof, or see what is missing or due.
---

Template version: 0.5.0

# Track controls and evidence

The register lives in the owner's organization on the service: controls as typed records, proof as kept documents, each control's regular proof as a commitment. Use the Ambitious connection's tools, such as `define_record_type`, `ingest_document`, `propose_commitment` and `complete_obligation`, only when this bot's instructions allow them (version 14 or later); otherwise call none and tell the owner.

Read how the register is laid out and where a control stands:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide compliance --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- The register records what the owner tells it. It does not judge whether the business meets any law, standard or certification, and neither do you: report what is on record, never a compliance opinion.
- You propose; a member of the owner's organization confirms, activates and accepts on the service's `/records` page. No tool does.
- A control's status comes only from the guide's rule over what the tools returned; otherwise it is `unknown`.
- Never place credentials in any field.
