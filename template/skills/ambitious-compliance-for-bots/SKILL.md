---
name: ambitious-compliance-for-bots
description: For the Ambitious Bot only. Keep a register of controls, evidence and attestations with the Ambitious Compliance CLI. Use when the owner asks the Ambitious Bot to track what a program requires, record proof that it was done, see what is missing or about to expire, or check that a recorded document has not changed.
---

Template version: 0.3.2

# Track controls and evidence with Ambitious Compliance

Use the installed `ambitious-compliance` binary in `/workspace/ambitious/bin`. `commands` lists every command.

Read which command fits which request, with its input:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide compliance --json
```

If it is missing or answers `E_USAGE`, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- The module records what the owner tells it. It does not judge whether the business meets any law, standard or certification, and neither do you: report its statuses as the state of the register, never as a compliance opinion.
- Copy colors and reasons from `status`; never work them out yourself.
- `E_CHAIN` means the history failed verification: stop writing, keep the database as it is, and tell the owner.
- Never place credentials in any field.
