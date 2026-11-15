# ambitious-kit

Ambitious modules are open-source, single-purpose command-line tools with no user interface. A bot runs a module, passes JSON in and reads JSON out. This repository, the kit, is what every `ambitious-<module>` is built from: the contract a module follows, the shared code that implements the common parts of it, the lint and dependency rules, the contract tests, the installer and the files a new module repository starts with. It is not a module itself; [examples/hello](examples/hello) is the smallest one.

## What is here

| Path | What it is |
|---|---|
| [MODULE_CONTRACT.md](MODULE_CONTRACT.md) | The contract. Ten rules covering the command line and the JSON envelope, repeatable output, the SQLite database and its migrations, install and self-check, key handling, network use, versioning, and the checks a module passes before a release. It defines every term it uses, so you can read it with no other context. |
| [schemas/envelope.v1.json](schemas/envelope.v1.json) | The JSON Schema for the one JSON document every command prints. |
| [examples/envelopes](examples/envelopes) | Envelopes that are valid, and envelopes that are each broken in one named way. |
| [packages/kit](packages/kit) | `@ambitious/kit`: the command-line runner, the envelope, the SQLite and migration helpers, `selfcheck`, the installer and the contract tests, in TypeScript with no runtime dependencies. |
| [packages/kit-python](packages/kit-python) | `ambitious_kit`: the same for modules written in Python, standard library only. |
| [packages/lint](packages/lint) | `@ambitious/lint`: the comment ban and the other lint rules, a Python comment checker, and the `ambitious-standalone` command. |
| [packages/depcruise](packages/depcruise) | `@ambitious/depcruise`: which directory may import what. |
| [examples/hello](examples/hello) | A complete module on the kit: two commands, one migration, tests, a TLA+ model, bundled into one file. |
| [repo-template](repo-template) | The files every repo starts with: agent files, the contributing guide, code of conduct and security policy, issue and PR templates, license, directory layout, the pinned toolchain, the checks in `scripts/`, the verification skill in `verify/`, and a sample TLA+ model with a broken variant. |
| [verify](verify) | The kit's own verification skill: [verify/SKILL.md](verify/SKILL.md), the feature list, `verify/run`, and the formal-verification skill in [verify/formal](verify/formal/SKILL.md). |
| [spec](spec) | TLA+ models and how they are checked; see [spec/README.md](spec/README.md). The installer's model is in [packages/kit/spec](packages/kit/spec). |
| [.github/workflows](.github/workflows) | `ci.yml` checks this repo. `tlc.yml` and `lean.yml` are reusable workflows for every module. |

## Start a module on the kit

A kit release, tagged `kit-v<version>`, has these files. Start from the [latest release](https://github.com/AmbitiousBots/ambitious-kit/releases/latest); the file names in the steps below are from `kit-v0.1.1`.

| File | Use |
|---|---|
| `ambitious-kit-<version>.tgz`, `ambitious-lint-<version>.tgz`, `ambitious-depcruise-<version>.tgz` | The three npm packages, compiled to JavaScript with type declarations. A TypeScript module installs them as development dependencies. |
| `ambitious_kit-<version>.pyz` | The Python kit. A Python module unpacks it into its repository; run as a program it contract-tests a binary. |
| `ambitious-install-<version>.mjs` | The installer a bot runs to put a module into `$AMBITIOUS_HOME/bin`. |
| `ambitious-hello-<version>.mjs` | The example module, to try the installer and the contract tests on. |
| `SHA256SUMS` | The SHA-256 of every file above. |

For a TypeScript module:

1. Copy the template into the new repository: `node scripts/apply-template.mjs <path-to-repo>`, run from a checkout of this repository. It creates the files that are missing, never overwrites a file that exists, and prints what it did. Add `--dry-run` to see the list without writing.
2. Download the three `.tgz` files and `SHA256SUMS` from the release, check them with `shasum -a 256 -c SHA256SUMS --ignore-missing`, and commit them under `vendor/`. A module carries its copy of the kit, so its build never depends on a download.
3. Add them to `package.json` beside the tools they work with, at the versions this repository pins in its own `package.json`:

   ```json
   "devDependencies": {
     "@ambitious/kit": "file:vendor/ambitious-kit-0.1.1.tgz",
     "@ambitious/lint": "file:vendor/ambitious-lint-0.1.1.tgz",
     "@ambitious/depcruise": "file:vendor/ambitious-depcruise-0.1.1.tgz",
     "@types/node": "24.19.2",
     "dependency-cruiser": "18.7.2",
     "esbuild": "0.28.2",
     "eslint": "10.15.0",
     "typescript": "6.0.3"
   },
   "overrides": {
     "@typescript-eslint/typescript-estree": { "minimatch": "11.0.8" }
   }
   ```

   The `overrides` block is needed because npm applies overrides only from the package being installed, so the kit cannot carry it for a module. `@ambitious/lint` uses `@typescript-eslint/parser`, whose newest release still asks for minimatch 10, and every minimatch from 7.0.0 up to 11.0.0 has the denial-of-service advisory [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The override installs the fixed minimatch, so `npm audit` is clean. Drop it once the parser depends on minimatch 11.0.1 or later.

4. Copy `eslint.config.js`, `.dependency-cruiser.mjs`, `tsconfig.json`, `scripts/build.mjs` and the `scripts` block of `package.json` from [examples/hello](examples/hello), and keep the template's standalone check in `lint`: `"lint": "eslint . && node scripts/check-standalone.mjs"`. Change the module name in `scripts/build.mjs`.
5. Write the module in `src/` as the example does, add an entry to `verify/features.json` for each command, and run `npm run typecheck`, `npm run lint`, `npm run depcruise`, `npm test`, `npm run build`, `npm run contract`, `npm run tlc` and `node verify/run`.

The `adopt` feature in [verify/features.json](verify/features.json) does exactly these steps in a scratch directory on every run, so they are known to work.

For a Python module, apply the template the same way and follow [packages/kit-python](packages/kit-python).

## Checks

The checks need git and [mise](https://mise.jdx.dev), which installs the Node, Python and Java versions pinned in `.mise.toml`.

```text
mise trust && mise install && npm ci
npm run release:check
```

`release:check` runs every step below in order, then builds the release files, and ends with one table. CI runs the same command.

| Command | What it checks |
|---|---|
| `npm run typecheck` | The TypeScript types. |
| `npm run lint` | The lint rules in [packages/lint](packages/lint), then the standalone check below. `npm run lint:python` runs the comment ban on the Python kit. |
| `npm run check:standalone` | No tracked file contains an internal plan ID or a machine-specific path, so the repository makes sense to someone outside the organisation that maintains it. |
| `npm run depcruise` | The import rules in [packages/depcruise](packages/depcruise). |
| `npm run check:contract` | Every valid example passes the schema, every invalid example fails for the listed reason, and every envelope printed in the contract matches the schema. |
| `npm test` | Builds the example, then runs the tests for the kit, the rules, the template, the example and the checks themselves. `npm run test:python` runs the Python kit's tests. |
| `npm run contract -- <binary>` | The contract tests against a built module. `npm run contract:python` runs the Python and TypeScript suites on each other's example module. |
| `npm run tlc` | Every TLA+ model in `spec/`, `packages/kit/spec/` and `examples/hello/spec/` passes TLC, and every broken variant breaks the invariant listed for it. |
| `npm run verify` | `verify/run`: every user-visible feature in `verify/features.json`, each against a fresh temporary `AMBITIOUS_HOME`. |
| `npm run release:build` | Writes the release files and `SHA256SUMS` into `release/`, which git ignores. |

`check:standalone` can also check only changed files, a saved pull request description and commit messages, and can take extra patterns from a file kept outside the repository; run `node scripts/check-standalone.mjs --help`. Paths that are part of the documented runtime, such as the default home directory, are listed with a reason in [.standalone.json](.standalone.json).

## Release

A release is made from a commit on `main` where `npm run release:check` passed. Tag it `kit-v<version>`, where the version is the `version` in the root `package.json`, run `npm run release:build`, and attach every file in `release/` to the release.

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

[CONTRIBUTING.md](CONTRIBUTING.md) says how to file an issue, set up a checkout, run the checks and open a pull request. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report a security vulnerability privately, as [SECURITY.md](SECURITY.md) describes, not in an issue. Changes to the contract follow its own versioning rule (rule 9); see "How to propose a change" in the contract.

Part of [Ambitious](https://ambitiousbots.com). Licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
