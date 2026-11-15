# ambitious-kit

The kit holds the contract every ambitious-* module follows (CLI and JSON envelope, SQLite layout and migrations, install and self-check, key handling, testing and TLA+ verification bar) and the small shared helpers that implement it. It is not a customer-facing module.

The contract is [MODULE_CONTRACT.md](MODULE_CONTRACT.md). The envelope every command prints is defined in [schemas/envelope.v1.json](schemas/envelope.v1.json), with examples in [examples/envelopes](examples/envelopes). Run `npm run check:contract` (Node 24, no install needed) to check the examples and every envelope printed in the contract against the schema.

## What is here

| Path | What it is |
|---|---|
| [MODULE_CONTRACT.md](MODULE_CONTRACT.md) | The rules every module follows. |
| [packages/lint](packages/lint) | `@ambitious/lint`: the comment ban and the other lint rules, with a Python comment checker. |
| [packages/depcruise](packages/depcruise) | `@ambitious/depcruise`: which directory may import what. |
| [repo-template](repo-template) | The agent files, PR template, license and directory layout every repo gets. |

Copy the template into a repo with `node scripts/apply-template.mjs <path-to-repo>`. It creates the files that are missing, never overwrites a file that exists, and prints what it did. Add `--dry-run` to see the list without writing.

## Checks

```text
npm ci && npm run typecheck && npm test && npm run lint && npx depcruise src
```

Part of [Ambitious](https://ambitiousbots.com). Licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
