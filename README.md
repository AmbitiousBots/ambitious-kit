# ambitious-kit

Ambitious modules are open-source, single-purpose command-line tools with no user interface. A bot runs a module, passes JSON in and reads JSON out. This repository, the kit, holds the contract every `ambitious-<module>` follows and the shared pieces that go with it. It is not a module itself.

## What is here

| Path | What it is |
|---|---|
| [MODULE_CONTRACT.md](MODULE_CONTRACT.md) | The contract. Ten rules covering the command line and the JSON envelope, repeatable output, the SQLite database and its migrations, install and self-check, key handling, network use, versioning, and the checks a module passes before a release. It defines every term it uses, so you can read it with no other context. |
| [schemas/envelope.v1.json](schemas/envelope.v1.json) | The JSON Schema for the one JSON document every command prints. |
| [examples/envelopes](examples/envelopes) | Envelopes that are valid, and envelopes that are each broken in one named way. |
| [packages/lint](packages/lint) | `@ambitious/lint`: the comment ban and the other lint rules, a Python comment checker, and the `ambitious-standalone` command. |
| [packages/depcruise](packages/depcruise) | `@ambitious/depcruise`: which directory may import what. |
| [repo-template](repo-template) | The files every repo starts with: agent files, PR template, license, directory layout, the pinned toolchain, the checks in `scripts/`, and a sample TLA+ model with a broken variant. |
| [spec](spec) | TLA+ models and how they are checked; see [spec/README.md](spec/README.md). |
| [.github/workflows](.github/workflows) | `ci.yml` checks this repo. `tlc.yml` and `lean.yml` are reusable workflows for every module. |

Copy the template into a repo with `node scripts/apply-template.mjs <path-to-repo>`. It creates the files that are missing, never overwrites a file that exists, and prints what it did. Add `--dry-run` to see the list without writing.

## Checks

The checks need git and [mise](https://mise.jdx.dev), which installs the Node and Java versions pinned in `.mise.toml`.

```text
mise trust && mise install && npm ci
npm run typecheck && npm run lint && npm run depcruise && npm run check:contract && npm test && npm run tlc
```

| Command | What it checks |
|---|---|
| `npm run lint` | The lint rules in [packages/lint](packages/lint), then the standalone check below. |
| `npm run check:standalone` | No tracked file contains an internal plan ID or a machine-specific path, so the repository makes sense to someone outside the organisation that maintains it. |
| `npm run depcruise` | The import rules in [packages/depcruise](packages/depcruise). |
| `npm run check:contract` | Every valid example passes the schema, every invalid example fails for the listed reason, and every envelope printed in the contract matches the schema. |
| `npm test` | The tests for the rules, the template and the checks themselves. |
| `npm run tlc` | Every TLA+ model in `spec/` passes TLC, and every broken variant in `spec/broken/` breaks the invariant listed for it. |

`check:standalone` can also check only changed files, a saved pull request description and commit messages, and can take extra patterns from a file kept outside the repository; run `node scripts/check-standalone.mjs --help`. Paths that are part of the documented runtime, such as the default home directory, are listed with a reason in [.standalone.json](.standalone.json).

## Reusable workflows

A module calls the kit's workflows from its own CI, pinned to a commit of this repository:

```yaml
jobs:
  tlc:
    uses: AmbitiousBots/ambitious-kit/.github/workflows/tlc.yml@<commit>
  lean:
    uses: AmbitiousBots/ambitious-kit/.github/workflows/lean.yml@<commit>
```

`tlc.yml` installs the toolchain from the calling repo's `.mise.toml` and runs its `scripts/tlc.mjs`; both come from the template. Input `spec-directory` defaults to `spec`. `lean.yml` installs the Lean version named in the `lean-toolchain` file and runs `lake build`; input `directory` (default `proofs`) is where the Lake package lives.

## Contributing

Open an issue to discuss a change, or a pull request that makes it. Changes to the contract follow its own versioning rule (rule 9); see "How to propose a change" in the contract. Before you push, run the checks above.

Part of [Ambitious](https://ambitiousbots.com). Licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
