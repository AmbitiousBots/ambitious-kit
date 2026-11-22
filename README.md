# ambitious-kit

Ambitious modules are open-source, single-purpose command-line tools with no user interface. A bot runs a module, passes JSON in and reads JSON out. This repository, the kit, is what every `ambitious-<module>` is built from: the contract a module follows, the shared code that implements the common parts of it, the lint and dependency rules, the contract tests, the installer and the files a new module repository starts with. It is not a module itself; [examples/hello](examples/hello) is the smallest one.

## What is here

| Path | What it is |
|---|---|
| [MODULE_CONTRACT.md](MODULE_CONTRACT.md) | The contract. Ten rules covering the command line and the JSON envelope, repeatable output, the SQLite database and its migrations, install and self-check, key handling, network use, versioning, and the checks a module passes before a release. It defines every term it uses, so you can read it with no other context. |
| [schemas/envelope.v1.json](schemas/envelope.v1.json) | The JSON Schema for the one JSON document every command prints. |
| [examples/envelopes](examples/envelopes) | Envelopes that are valid, and envelopes that are each broken in one named way. |
| [schemas/interchange](schemas/interchange) | The interchange schemas: the JSON shapes a bot carries from one module to another (a tasks snapshot, a constraint model and its solution, a schedule plan, a calendar holds proposal). Part 5 of the contract says how they are used; [examples/interchange](examples/interchange) has a valid document and broken ones for each. |
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

A kit release, tagged `kit-v<version>`, has these files. Start from the [latest release](https://github.com/AmbitiousBots/ambitious-kit/releases/latest); the file names in the steps below are from `kit-v0.4.7`.

| File | Use |
|---|---|
| `ambitious-kit-<version>.tgz`, `ambitious-lint-<version>.tgz`, `ambitious-depcruise-<version>.tgz` | The three npm packages, compiled to JavaScript with type declarations. A TypeScript module installs them as development dependencies. |
| `ambitious_kit-<version>.pyz` | The Python kit. A Python module unpacks it into its repository; run as a program it contract-tests a binary. |
| `ambitious-install-<version>.mjs` | The installer for one module: it puts a named release into `$AMBITIOUS_HOME/bin`. |
| `ambitious-modules-<version>.mjs` | The installer a bot runs: one `sync` command installs, repairs, upgrades and selfchecks every module pinned by this release. |
| `ambitious-template-<version>.tgz` | The Ambitious Bot template: its instructions, skills, guides, routines, fixtures, module pins and `bot.json`. |
| `ambitious-hello-<version>.mjs` | The example module, to try the installer and the contract tests on. |
| `SHA256SUMS` | The SHA-256 of every file above. |

For a TypeScript module:

1. Copy the template into the new repository: `node scripts/apply-template.mjs <path-to-repo>`, run from a checkout of this repository. It creates the files that are missing, never overwrites a file that exists, and prints what it did. Add `--dry-run` to see the list without writing.
2. Download the three `.tgz` files and `SHA256SUMS` from the release, check them with `shasum -a 256 -c SHA256SUMS --ignore-missing`, and commit them under `vendor/`. A module carries its copy of the kit, so its build never depends on a download.
3. Add them to `package.json` beside the tools they work with, at the versions this repository pins in its own `package.json`:

   ```json
   "devDependencies": {
     "@ambitious/kit": "file:vendor/ambitious-kit-0.4.7.tgz",
     "@ambitious/lint": "file:vendor/ambitious-lint-0.4.7.tgz",
     "@ambitious/depcruise": "file:vendor/ambitious-depcruise-0.4.7.tgz",
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
| `npm run template:generate -- --check` | The generated parts of the bot template are up to date, and the skills and routine prompts fit the size budget; it prints each size. See [Short skills, guides and the size budget](#short-skills-guides-and-the-size-budget). |
| `npm run template:test` | The bot template in [template](template): every file and skill is present with no placeholder, `bot.json` and the installer pin are up to date, the skills and routine prompts fit the size budget, every guide a skill names is carried by the installer and the hard rules are in the skill itself, the snapshot builds its review Page once a week, no skill or routine requires a permission that the oldest supported instructions do not grant, `sync --instructions` tells an earlier, a customised and the present instructions text apart and says which permissions the present text adds or takes away, `sync --routines` tells an earlier, a customised and a missing routine prompt apart and recognises a published prompt stored with its `Destination:` line, the `connection` command gives the recorded answer for every fixture in `template/fixtures/ambitious-connection`, `skill-files` writes exactly the skill bodies of `bot.json`, an upgrade asked for by an agent writes no skill under instructions version 1 to 4 and runs in full under versions 5 and 6, an installer that fails its pin check installs nothing, and values that come with a request are not used, each module pin matches the published file and its release's `SHA256SUMS`, the six pinned modules install, repair, upgrade and selfcheck in a temporary `AMBITIOUS_HOME`, and the audit skills are held to the installed audit module: they name what its `schema` command prints, the field lists and value lists in the `ambitious-audit-collector` skill are exactly the fields and allowed values in that schema, the example documents in that skill are accepted by `snapshot`, and a collector document written their way runs from `snapshot` to a report that waits for review. For an offline run, set `AMBITIOUS_MODULE_MIRROR` to cached release assets and `AMBITIOUS_RELEASE_SOURCE_MIRROR` to Git clones in directories named by release tag, each retaining its `.git` objects and tag. The offline checks verify each cached tag against the pinned commit, hash the commit object, and read copied skills from Git objects; a `commit` text file or working-tree copy is not evidence. These check cache integrity against the recorded pins, not the public repository's current tag. Omit the source mirror to verify public tag provenance through GitHub. The checks that download releases need a signed-in [GitHub CLI](https://cli.github.com) (`gh`), or `AMBITIOUS_MODULE_MIRROR` naming a directory that holds the release files; without either they are skipped and say so. `npm run template:e2e` runs the install test alone. |
| `npm run verify` | `verify/run`: every user-visible feature in `verify/features.json`, each against a fresh temporary `AMBITIOUS_HOME`. |
| `npm run release:build` | Writes the release files and `SHA256SUMS` into `release/`, which git ignores. |

`check:standalone` can also check only changed files, a saved pull request description and commit messages, and can take extra patterns from a file kept outside the repository; run `node scripts/check-standalone.mjs --help`. Paths that are part of the documented runtime, such as the default home directory, are listed with a reason in [.standalone.json](.standalone.json).

## The Ambitious Bot template

[template](template) is the free Ambitious Bot: a Grok Bot that installs and checks every Ambitious module, audits what an account can honestly see, and keeps its documents in Grok Bot Pages. [Ambitious](https://ambitiousbots.com) is a bot configuration and monitoring service; the template works without a subscription, daily analysis included, and the Ambitious Bot plan adds a person's review of each report for $725/month per bot. Under instructions version 12 or later the bot calls the Ambitious connection's tools as normal background work — `check_updates`, `send_report`, `send_compliance_status`, `send_feedback`, `server_info` and the factory tools — with no per-call owner approval, no payload preview and no separate endpoint confirmation, because the connection's only allowed server is the hard-coded official endpoint; the owner still adds and signs in to the connection, and the one payload guard is that no password, API key, token or other secret is ever sent. Under versions 6 to 11 routine reports require an owner-granted pre-approval the platform confirms covers each call, and feedback requires per-call approval.

| File | What it is |
|---|---|
| [template/INSTRUCTIONS.md](template/INSTRUCTIONS.md) | The bot's instructions: who it is, a pointer to the skills, and the hard limits. Short and stable; see [Instructions that stay compatible](#instructions-that-stay-compatible). |
| [template/instructions.json](template/instructions.json) | Every instructions text a template has published: its `Instructions version`, its SHA-256 as published and with whitespace set aside, the `grants` it gives, and under `reasons` one line for each grant beyond the oldest supported text. The earlier texts are kept in [template/instructions](template/instructions). |
| [template/permissions.json](template/permissions.json) | For each skill and each routine, the grants it requires, the ones it uses only when the instructions allow them (`optional`), and the ones it names only to forbid (`rulesOut`). |
| [template/skills](template/skills) | One directory per skill. Each is a short job description: when to use it, the one or two commands to run, what to read in the result, and the hard rules. `ambitious-module-installer`, `ambitious-capability-probe`, `ambitious-getting-started` and `ambitious-factory-for-bots` are written here. The skills listed under `copied` in [template/skills/SOURCES.json](template/skills/SOURCES.json) come from a module's release tag, with only the `name` and `description` lines of the frontmatter changed and the template version line added here; those under `written` were written here for that module, and the record keeps the pinned release used as their source. The daily audit skills also document the required 0.3.0 interface, which must be released and pinned before daily reports run. |
| [template/routines.json](template/routines.json) | For each routine, the SHA-256 (with whitespace set aside) of the prompt every template release published, so a bot that still runs an earlier prompt can be told. Under `variants` each prompt also has the SHA-256 of the same text with its `Destination:` line added at the end, which is how some copies of the template stored their routines. |
| [template/guides](template/guides) | The reference text the skills point at: field tables, step-by-step procedures and edge cases, one file per topic. The installer carries them and prints one with `ambitious-modules guide <topic>`, because a skill is typed by a bot and has to stay short. |
| [template/routines.md](template/routines.md) | The routines: a daily selfcheck and daily snapshot, both active under instructions version 6 or later and silent unless something changed or needs the owner. The snapshot does nothing until the owner chooses monitoring. It then keeps its evidence current every day, builds its review Page once a week, and sends its report and compliance status: under instructions version 12 or later in the background once the connection is ready, and under versions 6 to 11 only when the owner has asked for that and the connection is ready; the owner can pause either. Each has a default time and runs in the owner's time zone, which the bot takes from the platform and asks for only when the platform gives none. A routine on the platform has no destination field, only a prompt, so each prompt says in words that the run reports as its reply in the bot's own chat. |
| [template/fixtures](template/fixtures) | Example files the skills refer to. The installer carries them and writes them to `$AMBITIOUS_HOME/template/fixtures`, because a skill cannot store files. |
| [template/modules.lock.json](template/modules.lock.json) | The pins: one `{ module, version, url, sha256 }` row per module release, described by [template/modules.lock.schema.json](template/modules.lock.schema.json). |
| [template/bot.json](template/bot.json) | Everything above as one payload for creating the bot: `name`, `description`, `version`, `instructions`, `skills` and `routines`. Generated. |

The bot runs one command, `node "$AMBITIOUS_HOME/bin/ambitious-modules" sync --json`, described in [packages/kit](packages/kit/README.md#installer). The pins, the fixtures and every skill body are embedded in that installer when it is built, so a kit release carries its own pins and its own skills in `ambitious-modules-<version>.mjs`.

Trust runs in one direction. The `ambitious-module-installer` skill pins the installer by its SHA-256; the installer holds the module pins and the skill bodies; a module file is installed only when its SHA-256 matches its pin, and a skill is written from a file the installer wrote (`ambitious-modules skill-files`) and checked against the SHA-256 the installer printed for it. Nothing is installed or run on the strength of a checksum published beside the file it describes, because whoever can replace a release can replace its `SHA256SUMS` too. A release checksum alone never authorizes a self-update: `sync` reports newer releases but fetches nothing from them. Under instructions version 6 or later, `self-update` additionally requires the checksum obtained through the Ambitious connection, whose only allowed server is the hard-coded `https://ambitiousbots.com/api/mcp`. Under versions 6 to 11 that checksum counts only once the endpoint is confirmed, as [Endpoint confirmation](#endpoint-confirmation) below says, and no tool result of that connection, including the public `server_info` identity string, establishes that trust; under version 12 or later no separate endpoint confirmation is needed, because the only allowed server is that one hard-coded official endpoint. A bot gets newer pins when its template is updated, which brings a skill with the newer installer's pin. The skill gives exactly three ways to fetch the installer (the release address, `gh release download`, or a mirror directory the owner names), and each is followed by the same pin check, which alone makes the link.

Every skill is named `ambitious-<name>`, and its description starts with `For the Ambitious Bot only.` followed by what it does and when the Ambitious Bot uses it. On Grok Bot a person's skills are one private library shared by all of that person's bots, so a skill the template adds can be seen and triggered by every other bot the same person owns. The prefix keeps a template skill from replacing another bot's skill of the same name, and the description keeps other bots from picking it up. A module release names its skills without the prefix, so for each copied skill `SOURCES.json` records the release tag, the commit, the file's path and SHA-256 in that release, and the two frontmatter lines as released (`releasedFrontmatter`). `npm run template:test` puts those two lines back and checks the SHA-256, which shows the rest of the file is the released text; it also fails when a skill lacks the prefix or when any file names a skill without it.

Because the library is shared, two Ambitious Bots made from different template versions use the same `ambitious-*` skills. Every skill body therefore starts with the line `Template version: <x.y.z>`, and one rule decides every write: a skill is written when none is stored or the stored one is from an older template; identical text is left alone; a skill from a newer template is never replaced by an older one, and neither is a skill of the same version whose text was changed. In the last two cases the bot follows the stored skill and tells the owner which template version owns it. The rule is a command, not a judgment: `ambitious-modules skills` takes the stored bodies, compares each with the body inside the installer, and answers `create`, `update`, `unchanged` or `keep`. A stored `ambitious-*` skill with no version line counts as older, since it comes from a template before 0.2.2.

No instruction, routine or skill may point at a file that is not on the bot's computer: a skill names a module's documentation by its public address, and a fixture by its path under `$AMBITIOUS_HOME/template/fixtures`. `npm run template:test` checks both.

### Short skills, guides and the size budget

A bot template is staged on the platform by a bot that types every skill body, so the skills have to be small. Each skill holds only what must be in front of the bot: when to use it, the one or two commands to run, what to read in the result, and the hard rules. The long reference text lives in [template/guides](template/guides) and is embedded in the installer at build time, the way the skill bodies are, so it is covered by the same pin. A bot reads it at run time:

```text
ambitious-modules guide            lists every guide: its topic, title and size
ambitious-modules guide <topic>    prints that guide as data.text and writes it to $AMBITIOUS_HOME/template/guides/<topic>.md
```

The trust root does not move: the pinned installer version, its release address, its SHA-256 and the fetch lines stay in the `ambitious-module-installer` skill itself, because no guide can be read until the installer is fetched. No guide carries a pin or a fetch line. Every skill that names a guide says what to do when the `guide` command is missing or answers `E_USAGE`: fetch the pinned installer first. A guide says that the stored skill's hard rules stand, and where the two differ the stricter one is followed.

The size is held to a budget, `TEMPLATE_BUDGET` in [packages/kit/scripts/template-budget.mjs](packages/kit/scripts/template-budget.mjs): one number for a single skill (its body and description) and one for all skills and both routine prompts together, counted as UTF-8 bytes. It is a conservative budget, not a measured platform limit: the platform's own limit is not known. `npm run template:generate`, with and without `--check`, prints every size and fails when the budget is exceeded, naming the item, its size, the budget and the fix, which is to move reference text into a guide. `npm run template:test` and `npm run release:check` run the same check, and `npm run release:build` builds nothing over the budget. The guides are not counted, because a bot never types them.

To change a pin, edit `template/modules.lock.json` with the release's asset address and the SHA-256 of the downloaded asset, give that module's skills in `template/skills/SOURCES.json` the new release tag and its commit, then run `npm run template:generate`. It rebuilds the installer and rewrites the generated parts: the `Template version` line of every skill, the installer's own SHA-256 in the `ambitious-module-installer` skill, and `bot.json`. `npm run template:test` fails when either is out of date. A changed routine prompt is a new entry in `template/routines.json`: the recorded `current` entry moves into `earlier`, so a bot that still runs it is told. The generator never touches `INSTRUCTIONS.md`.

### Instructions that stay compatible

A bot's instructions are set once, by its owner, when the bot is made. Nothing updates them afterwards, while the skills are replaced with every template update. So the template keeps the two apart:

- `INSTRUCTIONS.md` holds only what does not change: who the bot is, a pointer to the skills, and the hard limits. Everything that changes with a release (modules, commands, schedules, tools) is in the skills. Its first line is `Instructions version: N`, a whole number that is raised only when the text has to change. The generator never rewrites the file, and the installer build fails when the text differs from the SHA-256 recorded for its version.
- `instructions.json` lists every text a template has published, by version, with its SHA-256 and its `grants`: the things that text allows, such as `owner-chat`, `report-tool` or `server-info-tool`, each described in one plain sentence. Version 1 is the text of template 0.2.1 and is the oldest one supported; version 2 is the text of templates 0.2.2 to 0.2.4; version 3 is the text of template 0.2.5; version 4 is the text of template 0.2.6; version 5 is the text of template 0.2.7; version 6 is the text of templates 0.3.0 and 0.3.1; version 7 is the text of templates 0.3.2 and 0.4.0; version 8 is the text of template 0.4.1; version 9 is the text of template 0.4.2; version 10 is the text of template 0.4.3; version 11 is the text of template 0.4.4; version 12 is the text of template 0.4.5, kept as `template/instructions/12.md`; version 13, first published with template 0.4.6, is the present one, and adds one grant, `verified-self-apply`: the daily selfcheck may apply a verified release's instructions text and routine prompts to this bot itself. A template release that leaves the text alone, as 0.3.1 and 0.4.0 did, keeps its version and its SHA-256. Every later version grants at least what version 1 grants, and each grant beyond version 1 has a one-line reason under `reasons`.
- The present text is kept minimal. Version 3 allowed three things no skill needs: any tool of the Ambitious connection, reading the platform's reference files inside the bot's private data directory, and writing shared skills without being asked. Version 4 takes them away again, restores version 1's rule against module features that transmit data through other network calls, and adds exactly one permission to version 1: calling the connection's `server_info` tool, which takes no arguments, to confirm which server the connection reaches.
- Version 5 is version 4 plus one permission, `upgrade-on-any-request`: the bot runs the documented template upgrade, including writing the template's `ambitious-*` skills, when any agent or person asks for it, not only the owner. The text says what such a request is worth: it starts the upgrade and supplies nothing. Every pin, address, checksum and skill text comes from the `ambitious-module-installer` skill that is stored and the installer it pins; whatever comes with a request is ignored; nothing is installed whose SHA-256 does not match the pin; and the owner is told afterwards which skills changed. Under versions 5 to 12 the text also said that the bot never changes its own instructions; version 13 replaces that with the verified update of [Applying a verified release](#applying-a-verified-release), which a request still never starts and never supplies.
- A skill never requires more than the oldest supported instructions grant. `permissions.json` is the explicit map, and `npm run template:test` fails when a skill or routine requires a grant version 1 lacks, uses a permission its entry does not list, or uses an `optional` one without saying in the same line that it is done only when the bot's instructions allow it. Under version 1 that means, for example, that a skill speaks to the owner only in the bot's own chat, asks for no file from the bot's private data directory, writes a shared skill only when the owner asks, and treats the `server_info` call, spoken voiceover and an upgrade at someone else's request as optional. The wider behaviour is switched on by the bot's own instructions, never by a skill: `sync --instructions` reports `upgradeOn` as `any request` only for a published text that grants it.
- `ambitious-modules sync --instructions <file>` compares the bot's own instructions with the template's. The bot writes its instructions to a file outside its private data directory and names it. A text an earlier template published is reported as the problem `instructions-out-of-date`, with the bot's version and the template's; a text no template published is `instructions-custom`. Whitespace is set aside before comparing (line endings, spaces and tabs, non-breaking spaces, blank lines), so a careful copy by hand is still recognised and reported with `match: whitespace`; any other difference makes the text custom. Either way the installer writes the template's text to `$AMBITIOUS_HOME/template/instructions.md`, returns the differing lines, and says what applying the text would change in what the bot may do: when it grants more than the bot's present text, the result says "Applying this text gives the bot these additional permissions:" and names each one in plain words; when it grants fewer or the same, it says that. The check itself changes nothing, and its message says so: "This check changed nothing: ...". When the installer that makes the comparison is itself behind a newer kit release, the problem says so, and that the newer template may carry a different text, possibly a narrower one, so the template should be updated first and the instructions applied after. Under instructions version 6 or later, the daily selfcheck also checks the published version and checksum from `check_updates`, and then applies the verified release's text itself, as [Applying a verified release](#applying-a-verified-release) below says.

- `ambitious-modules sync --routines <file>` does the same for routine prompts, which are copies too and would otherwise drift without anyone noticing. The bot lists its routines as `{ name, schedule, prompt }` in a JSON file outside its private data directory. For each routine of the template the result says `routine-prompt-out-of-date` (the prompt is one an earlier template published), `routine-missing` or `routine-custom` (nobody published that prompt), with the template's prompt. A published prompt that a bot stored with its `Destination:` line added at the end is still recognised as that prompt (`match: variant`). The check itself changes nothing. The update below replaces a prompt an earlier template published, saves a prompt written by hand to a Page before replacing it, and creates no missing routine.

### Daily updates and analysis

Instructions version 6 or later permits `check_updates`, with no arguments. Under versions 6 to 11 it runs only after the endpoint is confirmed as exactly `https://ambitiousbots.com/api/mcp`, as [Endpoint confirmation](#endpoint-confirmation) below says, and `server_info` then checks the claimed identity, which alone cannot authenticate a server; if the endpoint is not confirmed or it differs, the daily path fails closed: no self-update and no announcements relayed, including saved announcements in reports, and the bot reports the problem and waits for the owner's go-ahead in chat through the pre-v6 stored-skill-pin path, approval not making an unconfirmed checksum authoritative. Under version 12 or later `check_updates` runs whenever an update check is needed, with no separate endpoint confirmation, because the connection's only allowed server is that one hard-coded official endpoint. The selfcheck saves that result under `AMBITIOUS_HOME`, compares the kit and instructions versions, checks the tools offered to this bot, and reports new service announcements once. The bot calls only tools its own instructions allow. Under older instructions a routine reports what it can check and waits for the owner's request in chat.

For a newer kit, `ambitious-modules self-update --version <version> --sha256 <hex>` accepts the service's checksum and constructs only the public kit release URL. The installer bytes must match both that checksum and the release's `SHA256SUMS` fetched from the official repository URL `https://github.com/AmbitiousBots/ambitious-kit/releases/download/kit-vVERSION/SHA256SUMS`; this checksum chain does not change between versions, only whether an endpoint confirmation comes first. It refuses downgrades, keeps the old file and switches the link only after verification. The bot then runs `sync`, `skill-files` and `skills`, writes only skills answered `create` or `update`, and verifies the stored bodies.

### Applying a verified release

Installing the Ambitious Bot is the owner's consent to its updates, going forward under instructions version 13. After the verified `self-update`, the daily selfcheck applies that release's instructions text and routine prompts to this bot itself, only when this bot's instructions allow the verified update (published version 13 or later, or a hand-changed text that carries that rule): then with no owner yes for each update, no preview and no endpoint confirmation for the apply, also when the release adds grants. A skill, a guide or a routine prompt cannot replace a stored rule, so a bot whose stored instructions are version 1 to 12 writes nothing to itself; see [Bots on instructions versions 1 to 12](#bots-on-instructions-versions-1-to-12) below. Afterwards the bot tells the owner in its own chat what changed: the version, the checksum, and each permission added or removed. The procedure is the `auto-update` guide (`ambitious-modules guide auto-update`).

```text
ambitious-modules apply-plan --current <file> --published <file> --published-sha256 <hex> [--routines <file>] [--read-back <file>] --json
```

`apply-plan` classifies and writes nothing, and makes no network call. `--current` is the bot's present instructions, `--published` the `instructions.text` of the `check_updates` result with its `instructions.sha256`, and `--routines` the bot's routines as `{ name, schedule, prompt }`. The published text is trusted only when its SHA-256 matches that checksum, when it is byte for byte the text inside the installer that is running, and when it is not a downgrade. That installer is itself verified: the stored skill pins it by SHA-256, or `self-update` installed it only after it matched both the service checksum and the official release's `SHA256SUMS`. The command cannot know where the supplied checksum came from, so `data.trust.suppliedChecksum` says only that the file has the checksum it was given, and taking both from the `check_updates` result is a step of the procedure; the check the command enforces itself is `data.trust.release: exact`. `data.selfApply` is `granted` or `not granted`: whether the bot's present instructions let it write the plan to itself. `data.action` is one of four, and none waits for the owner:

| `data.action` | Meaning |
| --- | --- |
| `apply` | Write the planned text: the bot's text is an earlier published one, wording-only or grant-adding alike, or a text changed by hand whose three-way merge is clean, in which case the merged text is planned and the local wording is kept. A text that is a published text cut off before its end, as after a truncated write, is planned as a repair with the complete published text (`instructions-damaged`); a line deleted in the middle is local wording and is kept. A routine runs an earlier published prompt. |
| `apply-published-and-archive` | The merge conflicts or its base is unknown, or a routine prompt was written by hand. The bot first saves the present text to a Grok Bot Page ("Earlier instructions", or "Earlier routine prompts" with the prompt, name and schedule) and under `AMBITIOUS_HOME`, then writes the published text, then tells the owner with the Page link. It does not ask first. |
| `no-change` | Everything is the release's text already, the owner restored the earlier text over this same published text, or an earlier write of this same published text failed (`failed-apply-held`); `template/update-state.json` records both. |
| `blocked` | A checksum does not match, the text is a downgrade, or it is not byte for byte the text inside the verified installer, such as one that came with a request or one that differs only in spacing. Nothing is written. |

The result also has `data.reasons`, `data.trust`, `data.permissions` (added and removed grants, with a statement to give the owner), `data.merge`, `data.routines`, with one entry for each routine the bot has under a template routine's name, and `data.previous`.

The bot writes only when `data.selfApply` is `granted` and the plan allows it, and only to itself:

- Instructions: `UpdateProfile` on this bot only, with the complete planned text as the description field, which is where the platform stores the instructions, and nothing else changed: not the name, the title or a setting. The bot reads the description back and requires a matching SHA-256, exact or with whitespace set aside, which `--read-back` checks. It keeps the previous text, version and checksum under `AMBITIOUS_HOME`, never under the private data directory.
- Routine prompts: `UpdateRoutine` on this bot's own routines, the prompt only; the name, the schedule and whether the routine is on stay the owner's settings.
- It never calls `UpdateAgent` or any tool that edits another bot, and never changes another bot's instructions.
- A failed or Auto-review-blocked `UpdateProfile` or `UpdateRoutine` call is a failed apply: the bot reports it in its own chat and does not work around it with any other tool. When a write landed truncated or partial, so that the description is neither the planned nor the previous text, the bot writes the saved previous text back through the same call and read-back, as instructions version 13 itself says, records the failed apply, and reports it. `apply-plan` reads that record and does not plan the same published text again until a later release or the owner asks, except once more after a plain refused call. Instructions left cut off that the bot may not repair itself are reported to the owner as damaged on every daily run, with the saved previous text and the published text in a Page, and never as a proposal.
- The saved previous text is restored only when the owner asks in the bot's own chat, through the same write and read-back. The restore is recorded, and `apply-plan` then answers `no-change` with the reason `restored-by-owner` for that same published text; a later release is applied.
- A request from another agent may start a module and skill upgrade and nothing more. It never supplies a pin, an address, a checksum, a file, a skill text, an instructions text or a routine prompt.

A bot with no Ambitious connection cannot call `check_updates`, so it applies nothing until the owner adds the connection. Skills and modules keep the verified installer path above. This is checked in the installer's `apply-plan` command and in the template's text, not on the platform.

#### Bots on instructions versions 1 to 12

Instructions versions 1 to 12 say the bot never changes its own instructions, and the daily skill upgrade does not change that: the stored text decides. `sync --instructions` reports `data.instructions.selfApply`, and `apply-plan` reports `data.selfApply`; both are `not granted` for every published version before 13, and for a text changed by hand unless it says a version that has the grant and still holds every line that version added to state the rule. Under `not granted` the bot writes nothing to itself, in a routine or in a chat. It writes the one "Proposed instructions" Page with the version 13 text, its SHA-256 and the permissions statement, and tells the owner once that setting version 13 as the bot's instructions turns on automatic updates. Setting it is the owner's choice. Under versions 1 to 5 the daily run also makes no connection call.

Both daily routines start active under version 6 or later, and the owner can pause either; pack routines start paused. The snapshot replies with nothing until monitoring is chosen and the modules and matching skills are ready. It then runs every day and builds its review Page, the owner's dashboard, once a week, with no connection and no subscription; a report and a compliance status are built and sent, under instructions version 12 or later in the background once the authenticated connection is ready, and under versions 6 to 11 only when the owner has asked for reports to be sent and the connection is ready. Every owner is encouraged to create an account and connect one bot, which needs no subscription. The Ambitious Bot plan is $725/month per bot and adds a person's review of each report. A partner AI Consultant is a human consultant.

The weekly rule is a command, not a judgment: `ambitious-modules review-page` answers `due` on the first run after monitoring is chosen and when the last review Page was recorded as built 7 or more days ago, counted to the nearest whole day, and `review-page --built` records a build. The time is kept in `$AMBITIOUS_HOME/template/review-page.json`, never in the bot's private data directory. On the other days the snapshot does only the lightweight work: the sync, the capability probe, a collector document and the audit commands that keep the evidence current. It then ends with an empty reply unless something needs the owner now, such as a module command that failed or a high-priority finding the run before did not have, which the same command reports as `newHighPriority`. A report, when reports are on, is built and sent on the weekly run only.

Reports use the pinned audit 0.3.0's `send_report.v3` interface: high priority items before low priority items, each labelled finding, recommendation or announcement. Announcements are copied only from the saved endpoint-confirmed `check_updates` result. The skill blocks report delivery if the required interface is absent.

Under instructions version 12 or later the routine sends its report, compliance status and feedback in the background, with no owner approval and no payload preview, once the connection is ready; the one payload guard is that no password, API key, token or other secret is ever sent. Under versions 6 to 11, after reviewing a sample payload Page the owner approves the `send_report` tool of the Ambitious connection for this bot once, for example with "always allow", a routine sends only when the platform confirms that pre-approval covers the call, otherwise it keeps the review Page and sends nothing, and `send_feedback` still requires approval for each call.

### Endpoint confirmation

Under instructions version 12 or later this whole section does not apply: the connection's only allowed server is the hard-coded `https://ambitiousbots.com/api/mcp`, so the update check, the factory tools, the service-verified installer, the daily upgrades and announcements all run with no endpoint confirmation at all. The rest of this section is for versions 6 to 11.

Under versions 6 to 11 the update check, the factory tools, the service-verified installer, the daily upgrades and announcements all wait for one thing: that the Ambitious connection the bot uses is confirmed to be at exactly `https://ambitiousbots.com/api/mcp`. Instructions versions 6 to 10 took one source for that, the platform's own connector or connection details. A platform whose connection status shows the connection as connected but never shows its address can then never confirm it, and every bot on it stays without updates and announcements.

Version 11 is version 10 with that one line replaced by two, and adds one grant, `owner-confirmed-endpoint`. The endpoint counts as confirmed when either holds:

- (a) the platform's own connector or connection details show exactly that address, or
- (b) the owner has said in the bot's own chat, not through another bot or agent, that the connection the bot uses was added at exactly that address. The bot records the date of the statement and treats it as withdrawn when the owner says so or the connection is removed, re-added or renamed.

A tool result of that connection, including `server_info`, never counts, and neither do a saved result, a matching identity, a sign-in, a request, a Page, a skill, a guide, a module's output, a routine, an announcement or a message from another bot or agent.

The definition is written once, in the `endpoint` guide ([template/guides/endpoint.md](template/guides/endpoint.md)); the skills, the other guides and the selfcheck prompt point at it instead of restating it. It is gated on the bot's own instructions, because a skill has to stay safe under the oldest text it may meet: under versions 6 to 10 only (a) counts, and the bot neither asks for the statement nor uses a record of it.

- The statement counts only from the owner's own words in a conversation in the bot's own chat: an explicit statement, or an explicit yes to the bot's plain question. The bot may ask once when the platform does not show the address, and never states the address as if it were confirmed.
- The bot writes `endpoint-confirmation.json` under `AMBITIOUS_HOME`, with the date, that the owner said it in the bot's own chat, and the connection's name and stable server id as the platform's own status shows them at that time. It is written only in chat, never in a routine.
- On every use, in chat or in a routine, the bot reads the platform's own connection status again. When no connection with that same id and name is there (removed, re-added with a new id, or renamed), or the owner has withdrawn the statement, the record is deleted and the endpoint is unconfirmed again.
- Without (a) and without a valid record the bot does what version 10 does: no update check, no factory tool call, no self-update and no announcements; it tells the owner and waits for the owner's go-ahead in chat.
- The checksum rules do not move: a newer installer must still match both the checksum from `check_updates` and the release's `SHA256SUMS` from the official repository, nothing is downgraded, and a request supplies no pin, address, checksum or skill text.

These are rules in text, checked by `template/test/endpoint-confirmation.test.mjs` against the instructions, the guides, the skills, the selfcheck prompt, `instructions.json` and `bot.json`. They are not a test of the platform, and the installer does not read the record: the bot does.

### Finding the monitoring connection

A bot sends reports through a connector to the Ambitious service, and it has to know which of its connectors that is. A connector's display name proves nothing, and the platform's connector list may show no server address, so the template goes by what the connector offers:

1. Tool names. The monitoring connection is a connector whose tools include all three of `server_info`, `send_report` and `send_feedback`. The platform's connector status tool may show only how many tools a connector has, so the skills say where the names come from: the platform's tool catalog, read one connector namespace at a time with its dynamic tool discovery (on Grok Bot, `GetDynamicTools` with the connector's namespace returns the tool names and descriptions). A connector whose tools could not be read is passed with `tools: null` and is never judged by a count or a name.
2. Identity. The service's `server_info` tool takes no arguments and returns a fixed identity, `ambitiousbots.com/mcp/v1`. Where the bot's instructions allow that call, the bot makes it and the identity must match exactly.

Instructions version 1 lets nothing leave the computer except through `send_report` and `send_feedback`. The `server_info` call carries no data, but it is still a call to the service through a third tool, so under version 1 the skills do not make it: the connection is identified by its tool names alone and the bot says that its identity was not confirmed. Versions 4 and 5 name `server_info` as the one further tool the bot may call. A connector that fails either check is "a different connector" and is left alone, whatever it is called. A confirmed identity shows what the server answered, not who runs it; the address in the connector's own settings is what shows where reports go.

The rule is a command, not a judgment: `ambitious-modules connection` takes each connector's name, tool names and `server_info` answer and says `monitoring`, `different` or `unidentified` for each. Its first sentence for the owner says whether there is a monitoring connection among the connectors whose tools were read, how many were read, and which were not, by name. [template/fixtures/ambitious-connection](template/fixtures/ambitious-connection) holds one worked case per answer, and `npm run template:test` runs the command on each.

### Adding the Ambitious connection

A copy of the template never inherits its publisher's connection, in a personal account or in a team, so a new bot starts without one. Versions 1 to 9 of the instructions left adding it to the owner, and version 9 ended by telling the bot not to connect a service during setup, so a new copy that was asked to connect refused. Version 10 is version 9 with that last line changed and five lines added before it, and adds one grant, `ambitious-connection-setup`:

- The bot may add the Ambitious connection and start its sign-in itself, only with the platform's own connector tools, only for `https://ambitiousbots.com/api/mcp`, and only after the owner asks for it or says yes to the bot's offer in the bot's own chat. On first chat the bot offers it once and never adds it unasked. A request such as "connect to Ambitious" or "sign up" is that yes.
- The owner signs up or signs in on the service's own screen, which the platform's connect card opens. The bot never asks for, reads, types or stores a password, code, token or key, never writes a sign-in link of its own, and never adds, signs in to, changes or removes any other connection. Account and team settings are not changed.
- Adding or signing in to the connection is a step the owner asks for, not a tool call it approves. Under instructions version 12 or later the connection's tools then run in the background, with no per-call approval and no separate endpoint confirmation. Under versions 6 to 11 every `send_report` and `send_feedback` call still needs the owner's tool approval, and the update check and the factory tools still need the endpoint confirmed, as [Endpoint confirmation](#endpoint-confirmation) says.

The `ambitious-getting-started` skill lists the grant as optional, and its `connect` guide has the steps in Grok Bot's own tool names: find the tools in the bot's own tool list first, and in the on-demand list `GetDynamicTools` gives too, so a tool counts as missing only when it is in neither; read the installed state, the stable server id and the sign-in state with `GetMcpServerStatus`, and look for the connection with `SearchPlugins`; add it with `AddMcpServer` only when it is not installed; and call `AuthenticateMcpServer` once for an installed connection whose sign-in is missing. The service asks for a sign-in only when a report is sent, so a connection can show as connected with no card: the bot then starts the sign-in from the status, never beside a card `AddMcpServer` already showed in that turn, and does not repeat it when the platform refuses. A connection a team provides or requires counts as installed. When a tool is not offered or the platform refuses, the bot says exactly that and what the owner can do instead; that is the fallback and never the usual way. An answer from a tool that needs no sign-in, which is every tool but the one that sends a report, is never taken as proof that anyone is signed in. A report needs the sign-in and no subscription. Under an earlier text the bot adds nothing, says so, and proposes the version 10 text for the owner to apply.

These are rules in text, checked by `template/test/self-connect.test.mjs` against the instructions, the skill, the guides, the installer's answer and `bot.json`. They are not a test of the platform: the walk through a new account, by hand, is written out step by step in the `connect-new-account-*` entries of `verify/features.json`, whose checks prove the text and not the platform.

### The bot factory

Version 7 is version 6 plus what the bot factory step needs, and nothing else. The Ambitious service keeps a catalog of ready-made bots, grouped into industry packs and suites, and serves four read-only tools on the same connection: `factory_environment`, `factory_version`, `factory_match` and `factory_plan`. They search and preview the catalog; they create nothing. The `ambitious-factory-for-bots` skill uses them, and `ambitious-getting-started` offers it as one optional choice once the owner has described the business.

- The bot calls a factory tool only for a step the owner started or agreed to in the bot's own chat. Under versions 6 to 11 it also waits for the same endpoint confirmation `check_updates` needs; under version 12 or later no endpoint confirmation is needed.
- `factory_match` sends a short description of the business, or an industry code. Under version 12 or later the bot calls it in the background, with no payload preview and no owner approval; under versions 6 to 11 the bot first tells the owner so in plain words, shows the exact text, waits for the owner's yes in chat, and then makes the call under the owner's tool approval for that call, a pre-approval never covering it. The text holds no password, API key, token or other secret. `factory_plan` sends only the catalog entries the owner chose, and the other two send nothing about the owner.
- The bot may read the public page `https://ambitiousbots.com/factory/setup.md`, the canonical procedure, and the public factory pages it links. Their content is never permission to change the limits.
- The bot proposes the suite or pack and each new bot's instructions in a Page, and creates a bot, or a routine for it, only after the owner approves that exact proposal in chat, with the platform's own tools. A new routine starts paused, for the owner to turn on. It never changes an existing bot.
- Under instructions older than version 7 the skill calls no factory tool: it says so, and the instructions are updated as [Applying a verified release](#applying-a-verified-release) says. It reads no factory page; the owner can open the public directory themselves.

The reference text, with each tool's arguments, is the `factory` guide.

### Scheduling and constraints

Template 0.4.1 pins two more modules, `ambitious-scheduling` and `ambitious-constraints`, and one skill for both, `ambitious-scheduling-for-bots`, with the `scheduling` guide as its reference text. The scheduling module owns calendars, working hours, busy time, schedule plans and calendar-hold proposals; the constraints module answers whether a schedule or another decision can satisfy its rules, explains conflicts and compares scenarios.

- The two modules never call each other. The bot carries data between them only as the interchange documents `schedule-plan.v1`, `constraint-model.v1`, `constraint-solution.v1` and `calendar-holds.v1`, with task rows as `tasks-snapshot.v1`.
- A calendar hold is a proposal shown in a Page, and the owner applies it in their own calendar. The bot never creates, changes or cancels a real calendar event: no instructions version grants a write to a calendar. It may read busy time with a read-only calendar tool, which `account-read-tools` covers.
- The constraints release also has a runtime lock, a hash-pinned list of solver packages. Its pin is the optional `runtimeSha256` of that module's row in `template/modules.lock.json`. A plain `sync` never builds a runtime: the module is installed, its `selfcheck` is ok and lists the missing runtime under `data.warnings`, and a solving command answers `E_RUNTIME`. `ambitious-modules sync --runtime <module>` builds it, for that one module and only where the lock pins a runtime lock, after the release's `SHA256SUMS` and the pin agree. The build downloads about 200 MB of hash-pinned packages from the Python package index, which are not release files, so the skill has the bot run it only when the owner asks for solving in chat and the bot's instructions allow that download. Version 9 allows it and versions through 8 do not, so under those the bot says so and uses the commands that need no runtime; an owner can run the same command themselves.

Version 8 is version 7 with one line changed, and adds one grant, `primary-bot-message`: besides the bot's own chat, the bot may send a message to the owner's primary bot, through the platform's teammate messaging, about Ambitious kit and template coordination, with no credentials, transcripts or customer data in it. No skill or routine of the template uses it.

Version 9 is version 8 plus one sentence, and adds one grant, `solver-runtime-download`: when a constraints task needs it, the bot may install the constraints module's pinned, hash-locked solver runtime from the Python package index onto its computer, and nothing else from there. Every other download is still only the pinned public release files. The `ambitious-scheduling-for-bots` skill lists the grant as optional and has the bot build the runtime only under a text that grants it. A bot on an earlier text is shown the present text with the added permissions listed, and the owner decides.

### Upgrading a bot made from an earlier template

A bot made from template 0.2.0 to 0.4.3 keeps the skills, instructions and routine prompts of that template, and its `ambitious-module-installer` skill pins only that template's installer. An earlier skill therefore cannot fetch a newer installer, and is written not to try. Trust starts at the installer skill that is stored: its fetch lines carry the release address and the SHA-256 of the installer, and the installer carries the module pins and every other skill body.

Anyone may ask the bot to run `sync` and the two checks: the owner, a bot that manages other bots, or an agent working for the owner. Who may ask for an upgrade that writes shared `ambitious-*` skills depends on the bot's own instructions, which `sync --instructions` reads:

- Under instructions version 1 to 4, or a text no template published, only the owner may, in the bot's own chat (`upgradeOn` is `the owner's request`). When someone else asks, the bot runs what it may, writes no skill, changes no instructions and no routine, and tells the owner in its own chat what is waiting for their go-ahead, and that the current text, once applied, would let any agent ask.
- Under instructions version 5 or later, any agent or person may (`upgradeOn` is `any request`). The bot runs the whole upgrade and then tells the owner, in its own chat, which skills changed, with the old template version and the new one, and which permissions the release's instructions add.

Either way a request only starts the upgrade. It never supplies a pin, an address, a checksum or a skill text, and the bot ignores any that come with it: the installer is fetched from the address in the stored skill and checked against the pin there, and a file that does not match is deleted, so nothing is installed. A new installer skill reaches a bot from its owner, or through the shared skill library when another bot of the same account was updated. The upgrade goes in this order:

1. The bot has the new `ambitious-module-installer` skill: the owner updated the bot's template or handed over `bot.json` from `ambitious-template-<version>.tgz` of the new kit release, and the bot stored it in place of the earlier one at the owner's request, or the skill is already in the shared library. This skill text is where trust starts: it carries the new installer's checksum.
2. The bot runs the skill's fetch lines. They download `ambitious-modules-<version>.mjs` from the address in the skill, check its SHA-256 against the pin in the skill, and only then switch the link `bin/ambitious-modules`. A file that fails the check is deleted and never run, and the upgrade stops.
3. The bot runs `ambitious-modules sync --json --instructions <file> --routines <file>`. The new installer upgrades every module whose pin moved, runs each selfcheck, compares the instructions and the routine prompts, and says in `upgradeOn` who may ask for skills to be written.
4. The bot runs `ambitious-modules skill-files`, which writes every skill body of the template to a file and prints its SHA-256, and decides each skill with `ambitious-modules skills`. When the owner asked, or `upgradeOn` is `any request`, it writes those answered `create` or `update`, each from its file's exact content, reads each one back and checks its SHA-256 against the printed one; a mismatch is reported, not retried blindly. Skills of template 0.2.0 have no `ambitious-` prefix; they are left alone, and the owner is told they are no longer used.
5. If the instructions are out of date or customised, the bot runs `apply-plan` as [Applying a verified release](#applying-a-verified-release) says, in the daily selfcheck or when the owner asks in the bot's own chat, never because a request asked, and only when this bot's instructions allow the verified update (published version 13 or later, or a hand-changed text that carries that rule). Under an earlier text it writes the "Proposed instructions" Page instead, and the owner sets the text. Where it is allowed, it writes the planned text with `UpdateProfile` on itself, description only, reads it back against the SHA-256, keeps the previous text, records the applied version and checksum, and tells the owner what changed.
6. If a routine prompt is out of date, the same plan, under the same condition, replaces it with the template's prompt through `UpdateRoutine` on the bot's own routine; a prompt written by hand is saved to a Page first; a missing routine is reported and not created.

Step 3 before step 2 fails safely: an earlier installer does not know `--instructions` or `--routines` and answers `E_USAGE`.

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

## Release notes

### 0.4.7

- Every module built on the kit accepts `--help`, with or without a command name, and answers with one successful envelope and nothing else on stdout: the same listing as `commands`, or the one named command's entry. It does not run the command, read stdin or open the database. Every other unknown flag is still `E_USAGE`.
- `commands` and `--help` list a command's input shape when the module declares one: `fields`, each `{ name, type, required }`, and one `example`. `readCommand`, `writeCommand` and `pureCommand` take the shape beside `input`; in Python it is the third argument of `read_command`, `write_command` and `pure_command`. A wrong shape, such as a `null` example value, an unknown field type or a type that is not a string, is refused as a module spec problem that names the command. A command that declares no shape is listed as before.
- The contract tests have a seventh check, `listed-shapes`: a listed example is sent to its command as input and must not be answered with `E_INPUT_SCHEMA`, and the example without each field listed as required must be. So a listed example must be safe to run against a fresh `AMBITIOUS_HOME`. `envelope-shape` also checks that `--help` succeeds, lists what `commands` lists and runs nothing.
- New shared parser for a write's `actor`, `parseActor` and `parse_actor`, for modules to adopt when they next take the kit: 1 to 200 Unicode characters, no control characters or line breaks, no half of a surrogate pair, no leading or trailing whitespace, internal spaces allowed, nothing trimmed. The `E_INPUT_SCHEMA` hint states the rule. The rules for ids and `idem_key` are unchanged.
- The installer's guides say more, and no skill rule changes. `records`: a type name is lower-case words joined by hyphens, and field and stage names use underscores. `compliance`: evidence may carry a weight of official, draft or decision, only current official evidence or a current attestation can turn a control green or yellow, the expires-soon window defaults to 30 days and is set with `withinDays`, and a color describes only what is on record. `tasks` and `scheduling`: one worked sketch each for one person, weekday hours and 14 days, which keeps `ambitious-tasks schedule suggest` (`horizon_days` and a `people` roster that is never stored) apart from `ambitious-scheduling` (`calendar add` with `tz`, `availability set`, `plan propose` with a `tasks-snapshot.v1` and a `horizon`). `tasks` also describes `list move` and the fields `next` returns. Every guide that names a write `actor` states the actor rule once.
- The `compliance` and `tasks` guides describe evidence weights, `withinDays` on `status`, `list move` and the wider `next` result as the modules' intended contract. The modules pinned by this release, compliance 0.1.0 and tasks 0.1.2, do not have them yet, so each guide says what to do when the installed module refuses them.
- The instructions stay at version 13, byte for byte, and the routine prompts and the automatic update are unchanged. The module pins are unchanged from 0.4.6.

### 0.4.6

- Installing the Ambitious Bot is the owner's consent to its updates, going forward under instructions version 13. Version 13 lets the daily selfcheck, and the bot when the owner asks in its own chat, apply a verified release's instructions text and routine prompts to the bot itself, with no owner yes for each update, no preview and no endpoint confirmation for the apply, also when the release adds grants. The bot tells the owner afterwards what changed: the version, the checksum, and each permission added or removed.
- A bot whose stored instructions are version 1 to 12 does not apply version 13 to itself: those texts forbid it, and a skill cannot replace a stored rule. It writes nothing, puts the version 13 text and its permissions statement in the one "Proposed instructions" Page, and tells the owner once that setting version 13 turns on automatic updates. `apply-plan` reports this as `selfApply`, and `sync --instructions` as `data.instructions.selfApply`.
- New installer command `apply-plan`, which classifies and writes nothing: `apply`, `apply-published-and-archive`, `no-change` or `blocked`. A text is used only when its SHA-256 matches both `check_updates` and the text inside the installer verified against the release's `SHA256SUMS`; a checksum mismatch, a downgrade, a text that came with a request and a text that is not byte for byte the installer's are `blocked`. No action waits for the owner. A published text cut off before its end is repaired with the complete published text; a line deleted in the middle is local wording and is kept. A published text the owner restored over is not applied again, and each of two routines with the same name is planned on its own. A write that failed is not repeated every day: while the release has the same SHA-256 the plan is `no-change` with the reason `failed-apply-held`, a refused call is planned once more, and the owner's ask in the bot's own chat tries it again. A bot whose cut-off instructions no longer allow the apply, or whose repair is held, writes nothing and tells the owner on every daily run that its instructions are damaged, with the texts in a "Damaged instructions" Page; that report is not the proposal and is not said only once.
- The bot writes its instructions only with `UpdateProfile` on itself, the description field and nothing else, reads the description back against the SHA-256, and keeps the previous text, version and checksum under `AMBITIOUS_HOME`. It writes routine prompts only with `UpdateRoutine` on its own routines. It never calls `UpdateAgent` and never changes another bot. A failed or blocked write is reported, not worked around, and a write that landed truncated is put back to the previous text.
- A clean three-way merge applies the merged text, so local wording is kept. Instructions that conflict or have an unknown base, and a routine prompt written by hand, are saved to a Page first, then replaced with the published text, and the owner is told with the Page link. A restore happens only when the owner asks.
- New guide `auto-update`. Instructions versions 1 to 12 are archived unchanged, byte for byte. The daily selfcheck prompt has new current text. The module pins are unchanged from 0.4.5.

### 0.4.5

- Instructions version 12 calls the Ambitious connection's tools as normal background work: `check_updates`, `send_report`, `send_compliance_status`, `send_feedback`, `server_info` and the factory tools run with no per-call owner approval, no payload preview, no announcement of each call and no separate endpoint confirmation, because the connection's only allowed server is the hard-coded official endpoint.
- The snapshot sends its report and compliance status on its schedule once the authenticated connection is ready, and feedback sends whenever there is some. Reviewing the owner's system is the service they installed, so a report, feedback or compliance status may carry what the audit observed; the one payload guard kept is that no password, API key, token or other secret is ever sent.
- A version 12 report is built with `reviewRequired` false, so it does not wait for a person to look at the review Page before it is sent; versions 6 to 11 keep that wait. `send_compliance_status` is called under version 12 or later only. Version 12 no longer lists the `owner-confirmed-endpoint` grant, which only version 11 needs.
- The owner still chooses monitoring once in setup, and the snapshot does nothing until then; factory tools still run only for a factory step the owner started or agreed to; a `server_info` identity mismatch still stops the daily update path.
- The owner still adds and signs in to the connection, and the `ambitious-getting-started` skill still says once that the bot reports to Ambitious for review. Instructions versions 1 to 11 are unchanged: a bot still on one of them keeps that version's approval, preview and endpoint-confirmation limits until the owner upgrades.
- The daily selfcheck and snapshot prompts have new current text; a bot with an earlier prompt is told, and changes it only when the owner asks. The module pins are unchanged from 0.4.4.

### 0.4.4

- Instructions version 11 lets the owner's statement in the bot's own chat count as the endpoint confirmation, when the platform's own connection details do not show the connection's address.
- The bot records the date of the statement and drops it when the owner withdraws it or the connection is removed, re-added or renamed. A tool result of the connection never counts.
- One definition of the endpoint confirmation, in the new `endpoint` guide; the skills, the other guides and the selfcheck prompt point at it. Under instructions versions 6 to 10 nothing changes.
- The daily selfcheck has a new prompt; a bot with the earlier prompt is told, and changes it only when the owner asks.
- The checksum rules and the module pins are unchanged from 0.4.3.

### 0.4.3

- Fixes a first run that refused to connect: instructions version 10 lets a bot add the Ambitious connection and start its sign-in with the platform's own connector tools, for `https://ambitiousbots.com/api/mcp` only and only after the owner asks or says yes. Version 9 told the bot not to connect a service during setup.
- The `ambitious-getting-started` skill and its new `connect` guide name the platform tools and their order, and keep the owner adding it by hand as the fallback for a missing or refused tool.
- Every approval is unchanged: reports and feedback still need the owner's tool approval, and the bot handles no password, token or key.
- Module pins are unchanged from 0.4.2.

### 0.4.2

- Instructions version 9 lets a bot install the constraints module's pinned, hash-locked solver runtime from the Python package index when a constraints task needs it, and nothing else from there.
- Module pins are unchanged from 0.4.1.

### 0.4.1

- Adds the scheduling and constraints modules: calendars, working hours, schedule plans and calendar-hold proposals, and decisions checked against rules.
- New skill `ambitious-scheduling-for-bots`, with its guide; a calendar hold is a proposal in a Page that the owner applies.
- Instructions version 8 lets a copy message the owner's primary bot about kit and template coordination; the owner applies it from the "Proposed instructions" Page.

### 0.4.0

- Interchange schemas: `schemas/interchange/` holds the versioned JSON shapes that cross between modules, and the contract's new Part 5 says a bot carries them; a module never calls another module. `json-schema` in both kits checks a document against one.
- Opt-in pinned runtime: a Python module may release a hash-pinned runtime lock beside its `.pyz`. `ambitious-install ... --runtime` verifies the lock and builds it under `$AMBITIOUS_HOME/<module>/runtime/`; without the flag nothing changes. `selfcheck` reports the runtime in `data.pinnedRuntime` and `data.warnings`, and a command that needs a runtime that is not there fails with the new shared code `E_RUNTIME`.
- The bot template, its instructions and its module pins are unchanged.

### 0.3.2

- Restores the bot factory step and tools: the bot can find ready-made bots for the owner's business in the Ambitious catalog.
- Instructions version 7 adds the factory grants; the owner applies it from the "Proposed instructions" Page.
- Matching sends a short business description only after the owner sees the exact text and approves the call.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) says how to file an issue, set up a checkout, run the checks and open a pull request. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report a security vulnerability privately, as [SECURITY.md](SECURITY.md) describes, not in an issue. Changes to the contract follow its own versioning rule (rule 9); see "How to propose a change" in the contract.

Part of [Ambitious](https://ambitiousbots.com). Licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
