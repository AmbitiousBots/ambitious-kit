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
| [template](template) | The Ambitious Bot template: the instructions, skills and routines of the free bot, and the list of module releases it installs. See [The Ambitious Bot template](#the-ambitious-bot-template). |
| [verify](verify) | The kit's own verification skill: [verify/SKILL.md](verify/SKILL.md), the feature list, `verify/run`, and the formal-verification skill in [verify/formal](verify/formal/SKILL.md). |
| [spec](spec) | TLA+ models and how they are checked; see [spec/README.md](spec/README.md). The installer's model is in [packages/kit/spec](packages/kit/spec). |
| [.github/workflows](.github/workflows) | `ci.yml` checks this repo. `tlc.yml` and `lean.yml` are reusable workflows for every module. |

## Start a module on the kit

A kit release, tagged `kit-v<version>`, has these files. Start from the [latest release](https://github.com/AmbitiousBots/ambitious-kit/releases/latest); the file names in the steps below are from `kit-v0.2.5`.

| File | Use |
|---|---|
| `ambitious-kit-<version>.tgz`, `ambitious-lint-<version>.tgz`, `ambitious-depcruise-<version>.tgz` | The three npm packages, compiled to JavaScript with type declarations. A TypeScript module installs them as development dependencies. |
| `ambitious_kit-<version>.pyz` | The Python kit. A Python module unpacks it into its repository; run as a program it contract-tests a binary. |
| `ambitious-install-<version>.mjs` | The installer for one module: it puts a named release into `$AMBITIOUS_HOME/bin`. |
| `ambitious-modules-<version>.mjs` | The installer a bot runs: one `sync` command installs, repairs, upgrades and selfchecks every module pinned by this release. |
| `ambitious-template-<version>.tgz` | The Ambitious Bot template: its instructions, skills, routines, fixtures, module pins and `bot.json`. |
| `ambitious-hello-<version>.mjs` | The example module, to try the installer and the contract tests on. |
| `SHA256SUMS` | The SHA-256 of every file above. |

For a TypeScript module:

1. Copy the template into the new repository: `node scripts/apply-template.mjs <path-to-repo>`, run from a checkout of this repository. It creates the files that are missing, never overwrites a file that exists, and prints what it did. Add `--dry-run` to see the list without writing.
2. Download the three `.tgz` files and `SHA256SUMS` from the release, check them with `shasum -a 256 -c SHA256SUMS --ignore-missing`, and commit them under `vendor/`. A module carries its copy of the kit, so its build never depends on a download.
3. Add them to `package.json` beside the tools they work with, at the versions this repository pins in its own `package.json`:

   ```json
   "devDependencies": {
     "@ambitious/kit": "file:vendor/ambitious-kit-0.2.5.tgz",
     "@ambitious/lint": "file:vendor/ambitious-lint-0.2.5.tgz",
     "@ambitious/depcruise": "file:vendor/ambitious-depcruise-0.2.5.tgz",
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
| `npm run template:test` | The bot template in [template](template): every file and skill is present with no placeholder, `bot.json` and the installer pin are up to date, no skill or routine requires a permission that the oldest supported instructions do not grant, `sync --instructions` tells an earlier, a customised and the present instructions text apart, each module pin matches the published file and its release's `SHA256SUMS`, the six pinned modules install, repair, upgrade and selfcheck in a temporary `AMBITIOUS_HOME`, and the audit skills are held to the installed audit module: they name what its `schema` command prints, the field lists and value lists in the `ambitious-audit-collector` skill are exactly the fields and allowed values in that schema, the example documents in that skill are accepted by `snapshot`, and a collector document written their way runs from `snapshot` to a report that waits for review. The checks that download releases need a signed-in [GitHub CLI](https://cli.github.com) (`gh`), or `AMBITIOUS_MODULE_MIRROR` naming a directory that holds the release files; without either they are skipped and say so. `npm run template:e2e` runs the install test alone. |
| `npm run verify` | `verify/run`: every user-visible feature in `verify/features.json`, each against a fresh temporary `AMBITIOUS_HOME`. |
| `npm run release:build` | Writes the release files and `SHA256SUMS` into `release/`, which git ignores. |

`check:standalone` can also check only changed files, a saved pull request description and commit messages, and can take extra patterns from a file kept outside the repository; run `node scripts/check-standalone.mjs --help`. Paths that are part of the documented runtime, such as the default home directory, are listed with a reason in [.standalone.json](.standalone.json).

## The Ambitious Bot template

[template](template) is the free Ambitious Bot: a Grok Bot that installs and checks every Ambitious module, audits what an account can honestly see, and keeps its documents in Grok Bot Pages. [Ambitious](https://ambitiousbots.com) is a bot configuration and monitoring service; the template works without a subscription, and monitoring adds reports sent to the service after the owner approves each send.

| File | What it is |
|---|---|
| [template/INSTRUCTIONS.md](template/INSTRUCTIONS.md) | The bot's instructions: who it is, a pointer to the skills, and the hard limits. Short and stable; see [Instructions that stay compatible](#instructions-that-stay-compatible). |
| [template/instructions.json](template/instructions.json) | Every instructions text a template has published: its `Instructions version`, its SHA-256, and the `grants` it gives. The earlier texts are kept in [template/instructions](template/instructions). |
| [template/permissions.json](template/permissions.json) | For each skill and each routine, the grants it requires, the ones it uses only when the instructions allow them (`optional`), and the ones it names only to forbid (`rulesOut`). |
| [template/skills](template/skills) | One directory per skill. `ambitious-module-installer`, `ambitious-capability-probe` and `ambitious-getting-started` are written here. The skills listed under `copied` in [template/skills/SOURCES.json](template/skills/SOURCES.json) come from a module's release tag, with only the `name` and `description` lines of the frontmatter changed and the template version line added here; those under `written` were written here for that module, and the record names the pinned release they describe. |
| [template/routines.md](template/routines.md) | The routines: a daily selfcheck that is silent unless something is wrong, and a snapshot that starts paused. Each has a default time and runs in the owner's time zone, which the bot takes from the platform and asks for only when the platform gives none. A routine on the platform has no destination field, only a prompt, so each prompt says in words that the run reports as its reply in the bot's own chat. |
| [template/fixtures](template/fixtures) | Example files the skills refer to. The installer carries them and writes them to `$AMBITIOUS_HOME/template/fixtures`, because a skill cannot store files. |
| [template/modules.lock.json](template/modules.lock.json) | The pins: one `{ module, version, url, sha256 }` row per module release, described by [template/modules.lock.schema.json](template/modules.lock.schema.json). |
| [template/bot.json](template/bot.json) | Everything above as one payload for creating the bot: `name`, `description`, `version`, `instructions`, `skills` and `routines`. Generated. |

The bot runs one command, `node "$AMBITIOUS_HOME/bin/ambitious-modules" sync --json`, described in [packages/kit](packages/kit/README.md#installer). The pins and the fixtures are embedded in that installer when it is built, so a kit release carries its own pins in `ambitious-modules-<version>.mjs`.

Trust runs in one direction. The `ambitious-module-installer` skill pins the installer by its SHA-256; the installer holds the module pins; a module file is installed only when its SHA-256 matches its pin. Nothing is installed or run on the strength of a checksum published beside the file it describes, because whoever can replace a release can replace its `SHA256SUMS` too. For the same reason the installer does not update itself: when a newer kit release exists, `sync` says so in `data.template` and `data.notes` and fetches nothing from it. A bot gets newer pins when its template is updated, which brings a skill with the newer installer's pin. The skill gives exactly three ways to fetch the installer (the release address, `gh release download`, or a mirror directory the owner names), and each is followed by the same pin check, which alone makes the link.

Every skill is named `ambitious-<name>`, and its description starts with `For the Ambitious Bot only.` followed by what it does and when the Ambitious Bot uses it. On Grok Bot a person's skills are one private library shared by all of that person's bots, so a skill the template adds can be seen and triggered by every other bot the same person owns. The prefix keeps a template skill from replacing another bot's skill of the same name, and the description keeps other bots from picking it up. A module release names its skills without the prefix, so for each copied skill `SOURCES.json` records the release tag, the commit, the file's path and SHA-256 in that release, and the two frontmatter lines as released (`releasedFrontmatter`). `npm run template:test` puts those two lines back and checks the SHA-256, which shows the rest of the file is the released text; it also fails when a skill lacks the prefix or when any file names a skill without it.

Because the library is shared, two Ambitious Bots made from different template versions use the same `ambitious-*` skills. Every skill body therefore starts with the line `Template version: <x.y.z>`, and one rule decides every write: a skill is written when none is stored or the stored one is from an older template; identical text is left alone; a skill from a newer template is never replaced by an older one, and neither is a skill of the same version whose text was changed. In the last two cases the bot follows the stored skill and tells the owner which template version owns it. The rule is a command, not a judgment: `ambitious-modules skills` takes the stored and the new bodies and answers `create`, `update`, `unchanged` or `keep` for each. A stored `ambitious-*` skill with no version line counts as older, since it comes from a template before 0.2.2.

No instruction, routine or skill may point at a file that is not on the bot's computer: a skill names a module's documentation by its public address, and a fixture by its path under `$AMBITIOUS_HOME/template/fixtures`. `npm run template:test` checks both.

To change a pin, edit `template/modules.lock.json` with the release's asset address and the SHA-256 of the downloaded asset, give that module's skills in `template/skills/SOURCES.json` the new release tag and its commit, then run `npm run template:generate`. It rebuilds the installer and rewrites the generated parts: the `Template version` line of every skill, the installer's own SHA-256 in the `ambitious-module-installer` skill, and `bot.json`. `npm run template:test` fails when either is out of date. The generator never touches `INSTRUCTIONS.md`.

The monitoring connection is the connector whose server address is `https://ambitiousbots.com/api/mcp`. The `ambitious-getting-started` and `ambitious-capability-probe` skills find it by that address and never by its display name: a connector that happens to be named Ambitious but has another address is reported as "a different connector" and left alone.

### Instructions that stay compatible

A bot's instructions are set once, by its owner, when the bot is made. Nothing updates them afterwards, while the skills are replaced with every template update. So the template keeps the two apart:

- `INSTRUCTIONS.md` holds only what does not change: who the bot is, a pointer to the skills, and the hard limits. Everything that changes with a release (modules, commands, schedules, tools) is in the skills. Its first line is `Instructions version: N`, a whole number that is raised only when the text has to change. The generator never rewrites the file, and the installer build fails when the text differs from the SHA-256 recorded for its version.
- `instructions.json` lists every text a template has published, by version, with its SHA-256 and its `grants`: the things that text allows, such as `owner-chat`, `report-tool` or `factory-tools`. Version 1 is the text of template 0.2.1 and is the oldest one supported; version 2 is the text of templates 0.2.2 to 0.2.4; version 3 is the present one. Every later version grants at least what version 1 grants.
- A skill never requires more than the oldest supported instructions grant. `permissions.json` is the explicit map, and `npm run template:test` fails when a skill or routine requires a grant version 1 lacks, uses a permission its entry does not list, or uses an `optional` one without saying in the same line that it is done only when the bot's instructions allow it. Under version 1 that means, for example, that a skill speaks to the owner only in the bot's own chat, asks for no file from the bot's private data directory, and treats the Factory tools and spoken voiceover as optional.
- `ambitious-modules sync --instructions <file>` compares the bot's own instructions with the template's. The bot writes its instructions to a file outside its private data directory and names it. A text an earlier template published is reported as the problem `instructions-out-of-date`, with the bot's version and the template's; a text no template published is `instructions-custom`. Either way the installer writes the template's text to `$AMBITIOUS_HOME/template/instructions.md` and returns the differing lines, and the bot puts both in a Page and tells the owner, in its own chat, that pasting the text is the owner's choice. Nothing changes a bot's instructions except its owner. The check runs in a chat, not in the daily routine, so an owner who keeps the earlier text is told once and not every morning.

### Upgrading a bot made from an earlier template

A bot made from template 0.2.0 to 0.2.4 keeps the skills, instructions and routine prompts of that template, and its `ambitious-module-installer` skill pins only that template's installer. An earlier skill therefore cannot fetch a newer installer, and is written not to try. The upgrade starts with the owner and goes in this order:

1. The owner gives the bot the new `ambitious-module-installer` skill, by updating the bot's template or by handing over `bot.json` from `ambitious-template-<version>.tgz` of the new kit release. The bot stores it in place of the earlier one. This skill text is where trust starts: it carries the new installer's checksum.
2. The bot runs the skill's fetch lines. They download `ambitious-modules-<version>.mjs` from the address in the skill, check its SHA-256 against the pin in the skill, and only then switch the link `bin/ambitious-modules`. A file that fails the check is deleted and never run.
3. The bot runs `ambitious-modules sync --json --instructions <file>`. The new installer upgrades every module whose pin moved, runs each selfcheck, and compares the instructions.
4. The bot decides every other skill with `ambitious-modules skills` and writes those it answers `create` or `update` for. Skills of template 0.2.0 have no `ambitious-` prefix; they are left alone, and the owner is told they are no longer used.
5. If the instructions are out of date or customised, the bot writes the Page with the proposed text and a short diff. The instructions change only if the owner pastes it. The same holds for routine prompts, which are copies too.

Step 3 before step 2 fails safely: an earlier installer does not know `--instructions` and answers `E_USAGE`.

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
