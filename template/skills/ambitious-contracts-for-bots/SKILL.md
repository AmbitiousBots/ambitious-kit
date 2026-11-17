---
name: ambitious-contracts-for-bots
description: For the Ambitious Bot only. Maintain a literal-quote obligation register with the Ambitious Contracts CLI, apply amendments, inspect due work and hand suggested payloads to the tasks module. Use when the Ambitious Bot is asked to track obligations from a contract or an amendment.
---

Template version: 0.3.1

# Contracts for bots

Track obligations from a contract or amendment with the installed `ambitious-contracts` binary. Run `selfcheck`, then `commands`, and inspect `ok`, `errors` and `data` of every answer.

Read how to register obligations, find due work and apply an amendment:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide contracts --json
```

If it is missing or answers `E_USAGE`, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- The module verifies literal evidence and dates. It does not decide what a clause legally means. Have a person review the proposed interpretation before relying on it.
- Submit exact quotes from the source text. Never paraphrase evidence to make it pass.
- Read both `accepted` and `rejected`, and inspect an uncertain response before repeating `propose`, which creates new obligations.
- Forward each `suggestedTask` unchanged to `ambitious-tasks add` and keep its `idem_key`. Do not write another module's database, and take dates from the output instead of calculating them.
- The module makes no model call and needs no key. Never place credentials in any field.
