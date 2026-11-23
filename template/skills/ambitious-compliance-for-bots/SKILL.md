---
name: ambitious-compliance-for-bots
description: For the Ambitious Bot only. Keep a register of controls, evidence and attestations with the Ambitious Compliance CLI. Use when the Ambitious Bot is asked to track what a program requires, record proof, see what is missing or expiring, or check that a recorded document is unchanged.
---

Template version: 0.4.10

# Track controls and evidence with Ambitious Compliance

Use the installed `ambitious-compliance` binary.

Read which command fits which request:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide compliance --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- The module records what the owner tells it. It does not judge whether the business meets any law, standard or certification, and neither do you: report its statuses as the state of the register, never as a compliance opinion.
- Copy colors and reasons from `status`; never work them out yourself.
- `E_CHAIN` means the history failed verification: stop writing, keep the database as it is, and tell the owner.
- Never place credentials in any field.
