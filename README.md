# ambitious-kit

The kit holds the contract every ambitious-* module follows (CLI and JSON envelope, SQLite layout and migrations, install and self-check, key handling, testing and TLA+ verification bar) and the small shared helpers that implement it. It is not a customer-facing module.

The contract is [MODULE_CONTRACT.md](MODULE_CONTRACT.md). The envelope every command prints is defined in [schemas/envelope.v1.json](schemas/envelope.v1.json), with examples in [examples/envelopes](examples/envelopes). Run `npm run check:contract` (Node 24, no install needed) to check the examples and every envelope printed in the contract against the schema.

Part of [Ambitious](https://ambitiousbots.com). Licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
