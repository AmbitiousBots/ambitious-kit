---
name: ambitious-contracts-for-bots
description: For the Ambitious Bot only. Keep a literal-quote obligation register with the Ambitious Contracts CLI: amendments, due work and suggested tasks. Use when the Ambitious Bot is asked to track obligations from a contract or an amendment.
---

Template version: 0.4.5

# Contracts for bots

Use the installed `ambitious-contracts` binary. Run `selfcheck`, then `commands`, and inspect `ok`, `errors` and `data` of every answer.

Read how to register obligations, find due work and apply an amendment:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide contracts --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- The module verifies literal evidence and dates. It does not decide what a clause legally means. Have a person review the proposed interpretation before relying on it.
- Submit exact quotes from the source text. Never paraphrase evidence to make it pass.
- Forward each `suggestedTask` unchanged to `ambitious-tasks add` and keep its `idem_key`. Do not write another module's database, and take dates from the output instead of calculating them.
- Never place credentials in any field.
