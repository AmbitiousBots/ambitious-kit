# ambitious-kit

Ambitious modules are open-source, single-purpose command-line tools with no user interface. A bot runs a module, passes JSON in and reads JSON out. This repository, the kit, holds the contract every `ambitious-<module>` follows and the shared pieces that go with it. It is not a module itself.

## What is here

- [MODULE_CONTRACT.md](MODULE_CONTRACT.md): the contract. Ten rules covering the command line and the JSON envelope, repeatable output, the SQLite database and its migrations, install and self-check, key handling, network use, versioning, and the checks a module passes before a release. It defines every term it uses, so you can read it with no other context.
- [schemas/envelope.v1.json](schemas/envelope.v1.json): the JSON Schema for the one JSON document every command prints.
- [examples/envelopes](examples/envelopes): envelopes that are valid, and envelopes that are each broken in one named way.
- [scripts](scripts): the checks below.

## Checks

The checks need Node 24 and git. There is nothing to install.

| Command | What it checks |
|---|---|
| `npm run check:contract` | Every valid example passes the schema, every invalid example fails for the listed reason, and every envelope printed in the contract matches the schema. |
| `npm run check:standalone` | No tracked file contains an internal plan ID or a machine-specific path, so the repository makes sense to someone outside the organisation that maintains it. |
| `node --test scripts/` | The tests for the checks themselves. |

`check:standalone` can also check only changed files, a saved pull request description and commit messages, and can take extra patterns from a file kept outside the repository; run `node scripts/check-standalone.mjs --help`. Paths that are part of the documented runtime, such as the default home directory, are listed with a reason in [.standalone.json](.standalone.json).

## Contributing

Open an issue to discuss a change, or a pull request that makes it. Changes to the contract follow its own versioning rule (rule 9); see "How to propose a change" in the contract. Before you push, run the three checks above.

Part of [Ambitious](https://ambitiousbots.com). Licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
