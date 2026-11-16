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

A kit release, tagged `kit-v<version>`, has these files. Start from the [latest release](https://github.com/AmbitiousBots/ambitious-kit/releases/latest); the file names in the steps below are from `kit-v0.3.0`.

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
     "@ambitious/kit": "file:vendor/ambitious-kit-0.3.0.tgz",
     "@ambitious/lint": "file:vendor/ambitious-lint-0.3.0.tgz",
     "@ambitious/depcruise": "file:vendor/ambitious-depcruise-0.3.0.tgz",
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
| `npm run template:test` | The bot template in [template](template): every file and skill is present with no placeholder, `bot.json` and the installer pin are up to date, no skill or routine requires a permission that the oldest supported instructions do not grant, `sync --instructions` tells an earlier, a customised and the present instructions text apart and says which permissions the present text adds or takes away, `sync --routines` tells an earlier, a customised and a missing routine prompt apart and recognises a published prompt stored with its `Destination:` line, the `connection` command gives the recorded answer for every fixture in `template/fixtures/ambitious-connection`, `skill-files` writes exactly the skill bodies of `bot.json`, an upgrade asked for by an agent writes no skill under instructions version 1 to 4 and runs in full under versions 5 and 6, an installer that fails its pin check installs nothing, and values that come with a request are not used, each module pin matches the published file and its release's `SHA256SUMS`, the six pinned modules install, repair, upgrade and selfcheck in a temporary `AMBITIOUS_HOME`, and the audit skills are held to the installed audit module: they name what its `schema` command prints, the field lists and value lists in the `ambitious-audit-collector` skill are exactly the fields and allowed values in that schema, the example documents in that skill are accepted by `snapshot`, and a collector document written their way runs from `snapshot` to a report that waits for review. For an offline run, set `AMBITIOUS_MODULE_MIRROR` to cached release assets and `AMBITIOUS_RELEASE_SOURCE_MIRROR` to Git clones in directories named by release tag, each retaining its `.git` objects and tag. The offline checks verify each cached tag against the pinned commit, hash the commit object, and read copied skills from Git objects; a `commit` text file or working-tree copy is not evidence. These check cache integrity against the recorded pins, not the public repository's current tag. Omit the source mirror to verify public tag provenance through GitHub. The checks that download releases need a signed-in [GitHub CLI](https://cli.github.com) (`gh`), or `AMBITIOUS_MODULE_MIRROR` naming a directory that holds the release files; without either they are skipped and say so. `npm run template:e2e` runs the install test alone. |
| `npm run verify` | `verify/run`: every user-visible feature in `verify/features.json`, each against a fresh temporary `AMBITIOUS_HOME`. |
| `npm run release:build` | Writes the release files and `SHA256SUMS` into `release/`, which git ignores. |

`check:standalone` can also check only changed files, a saved pull request description and commit messages, and can take extra patterns from a file kept outside the repository; run `node scripts/check-standalone.mjs --help`. Paths that are part of the documented runtime, such as the default home directory, are listed with a reason in [.standalone.json](.standalone.json).

## The Ambitious Bot template

[template](template) is the free Ambitious Bot: a Grok Bot that installs and checks every Ambitious module, audits what an account can honestly see, and keeps its documents in Grok Bot Pages. [Ambitious](https://ambitiousbots.com) is a bot configuration and monitoring service; the template works without a subscription, and the Ambitious Bot plan adds daily analysis and human review for $725/month per bot. Routine reports require an owner-granted pre-approval the platform confirms covers each call; feedback requires per-call approval.

| File | What it is |
|---|---|
| [template/INSTRUCTIONS.md](template/INSTRUCTIONS.md) | The bot's instructions: who it is, a pointer to the skills, and the hard limits. Short and stable; see [Instructions that stay compatible](#instructions-that-stay-compatible). |
| [template/instructions.json](template/instructions.json) | Every instructions text a template has published: its `Instructions version`, its SHA-256 as published and with whitespace set aside, the `grants` it gives, and under `reasons` one line for each grant beyond the oldest supported text. The earlier texts are kept in [template/instructions](template/instructions). |
| [template/permissions.json](template/permissions.json) | For each skill and each routine, the grants it requires, the ones it uses only when the instructions allow them (`optional`), and the ones it names only to forbid (`rulesOut`). |
| [template/skills](template/skills) | One directory per skill. `ambitious-module-installer`, `ambitious-capability-probe` and `ambitious-getting-started` are written here. The skills listed under `copied` in [template/skills/SOURCES.json](template/skills/SOURCES.json) come from a module's release tag, with only the `name` and `description` lines of the frontmatter changed and the template version line added here; those under `written` were written here for that module, and the record keeps the pinned release used as their source. The daily audit skills also document the required 0.3.0 interface, which must be released and pinned before daily reports run. |
| [template/routines.json](template/routines.json) | For each routine, the SHA-256 (with whitespace set aside) of the prompt every template release published, so a bot that still runs an earlier prompt can be told. Under `variants` each prompt also has the SHA-256 of the same text with its `Destination:` line added at the end, which is how some copies of the template stored their routines. |
| [template/routines.md](template/routines.md) | The routines: a daily selfcheck and daily snapshot, both active under instructions version 6 and silent unless something changed or needs the owner. The snapshot does nothing until monitoring is ready; the owner can pause either. Each has a default time and runs in the owner's time zone, which the bot takes from the platform and asks for only when the platform gives none. A routine on the platform has no destination field, only a prompt, so each prompt says in words that the run reports as its reply in the bot's own chat. |
| [template/fixtures](template/fixtures) | Example files the skills refer to. The installer carries them and writes them to `$AMBITIOUS_HOME/template/fixtures`, because a skill cannot store files. |
| [template/modules.lock.json](template/modules.lock.json) | The pins: one `{ module, version, url, sha256 }` row per module release, described by [template/modules.lock.schema.json](template/modules.lock.schema.json). |
| [template/bot.json](template/bot.json) | Everything above as one payload for creating the bot: `name`, `description`, `version`, `instructions`, `skills` and `routines`. Generated. |

The bot runs one command, `node "$AMBITIOUS_HOME/bin/ambitious-modules" sync --json`, described in [packages/kit](packages/kit/README.md#installer). The pins, the fixtures and every skill body are embedded in that installer when it is built, so a kit release carries its own pins and its own skills in `ambitious-modules-<version>.mjs`.

Trust runs in one direction. The `ambitious-module-installer` skill pins the installer by its SHA-256; the installer holds the module pins and the skill bodies; a module file is installed only when its SHA-256 matches its pin, and a skill is written from a file the installer wrote (`ambitious-modules skill-files`) and checked against the SHA-256 the installer printed for it. Nothing is installed or run on the strength of a checksum published beside the file it describes, because whoever can replace a release can replace its `SHA256SUMS` too. A release checksum alone never authorizes a self-update: `sync` reports newer releases but fetches nothing from them. Under instructions version 6, `self-update` additionally requires the checksum obtained through an Ambitious connection whose endpoint the bot independently confirmed from the platform's own connector or connection details as exactly `https://ambitiousbots.com/api/mcp`. No tool result of that connection, including the public `server_info` identity string, establishes this trust. A bot gets newer pins when its template is updated, which brings a skill with the newer installer's pin. The skill gives exactly three ways to fetch the installer (the release address, `gh release download`, or a mirror directory the owner names), and each is followed by the same pin check, which alone makes the link.

Every skill is named `ambitious-<name>`, and its description starts with `For the Ambitious Bot only.` followed by what it does and when the Ambitious Bot uses it. On Grok Bot a person's skills are one private library shared by all of that person's bots, so a skill the template adds can be seen and triggered by every other bot the same person owns. The prefix keeps a template skill from replacing another bot's skill of the same name, and the description keeps other bots from picking it up. A module release names its skills without the prefix, so for each copied skill `SOURCES.json` records the release tag, the commit, the file's path and SHA-256 in that release, and the two frontmatter lines as released (`releasedFrontmatter`). `npm run template:test` puts those two lines back and checks the SHA-256, which shows the rest of the file is the released text; it also fails when a skill lacks the prefix or when any file names a skill without it.

Because the library is shared, two Ambitious Bots made from different template versions use the same `ambitious-*` skills. Every skill body therefore starts with the line `Template version: <x.y.z>`, and one rule decides every write: a skill is written when none is stored or the stored one is from an older template; identical text is left alone; a skill from a newer template is never replaced by an older one, and neither is a skill of the same version whose text was changed. In the last two cases the bot follows the stored skill and tells the owner which template version owns it. The rule is a command, not a judgment: `ambitious-modules skills` takes the stored bodies, compares each with the body inside the installer, and answers `create`, `update`, `unchanged` or `keep`. A stored `ambitious-*` skill with no version line counts as older, since it comes from a template before 0.2.2.

No instruction, routine or skill may point at a file that is not on the bot's computer: a skill names a module's documentation by its public address, and a fixture by its path under `$AMBITIOUS_HOME/template/fixtures`. `npm run template:test` checks both.

To change a pin, edit `template/modules.lock.json` with the release's asset address and the SHA-256 of the downloaded asset, give that module's skills in `template/skills/SOURCES.json` the new release tag and its commit, then run `npm run template:generate`. It rebuilds the installer and rewrites the generated parts: the `Template version` line of every skill, the installer's own SHA-256 in the `ambitious-module-installer` skill, and `bot.json`. `npm run template:test` fails when either is out of date. The generator never touches `INSTRUCTIONS.md`.

### Instructions that stay compatible

A bot's instructions are set once, by its owner, when the bot is made. Nothing updates them afterwards, while the skills are replaced with every template update. So the template keeps the two apart:

- `INSTRUCTIONS.md` holds only what does not change: who the bot is, a pointer to the skills, and the hard limits. Everything that changes with a release (modules, commands, schedules, tools) is in the skills. Its first line is `Instructions version: N`, a whole number that is raised only when the text has to change. The generator never rewrites the file, and the installer build fails when the text differs from the SHA-256 recorded for its version.
- `instructions.json` lists every text a template has published, by version, with its SHA-256 and its `grants`: the things that text allows, such as `owner-chat`, `report-tool` or `server-info-tool`, each described in one plain sentence. Version 1 is the text of template 0.2.1 and is the oldest one supported; version 2 is the text of templates 0.2.2 to 0.2.4; version 3 is the text of template 0.2.5; version 4 is the text of template 0.2.6; version 5 is the text of template 0.2.7; version 6 is the present one. Every later version grants at least what version 1 grants, and each grant beyond version 1 has a one-line reason under `reasons`.
- The present text is kept minimal. Version 3 allowed three things no skill needs: any tool of the Ambitious connection, reading the platform's reference files inside the bot's private data directory, and writing shared skills without being asked. Version 4 takes them away again, restores version 1's rule against module features that transmit data through other network calls, and adds exactly one permission to version 1: calling the connection's `server_info` tool, which takes no arguments, to confirm which server the connection reaches.
- Version 5 is version 4 plus one permission, `upgrade-on-any-request`: the bot runs the documented template upgrade, including writing the template's `ambitious-*` skills, when any agent or person asks for it, not only the owner. The text says what such a request is worth: it starts the upgrade and supplies nothing. Every pin, address, checksum and skill text comes from the `ambitious-module-installer` skill that is stored and the installer it pins; whatever comes with a request is ignored; nothing is installed whose SHA-256 does not match the pin; and the owner is told afterwards which skills changed and which permissions a proposed instructions text would add. The instructions are still never changed by the bot, and updating an existing routine remains the owner's choice.
- A skill never requires more than the oldest supported instructions grant. `permissions.json` is the explicit map, and `npm run template:test` fails when a skill or routine requires a grant version 1 lacks, uses a permission its entry does not list, or uses an `optional` one without saying in the same line that it is done only when the bot's instructions allow it. Under version 1 that means, for example, that a skill speaks to the owner only in the bot's own chat, asks for no file from the bot's private data directory, writes a shared skill only when the owner asks, and treats the `server_info` call, spoken voiceover and an upgrade at someone else's request as optional. The wider behaviour is switched on by the bot's own instructions, never by a skill: `sync --instructions` reports `upgradeOn` as `any request` only for a published text that grants it.
- `ambitious-modules sync --instructions <file>` compares the bot's own instructions with the template's. The bot writes its instructions to a file outside its private data directory and names it. A text an earlier template published is reported as the problem `instructions-out-of-date`, with the bot's version and the template's; a text no template published is `instructions-custom`. Whitespace is set aside before comparing (line endings, spaces and tabs, non-breaking spaces, blank lines), so a careful copy by hand is still recognised and reported with `match: whitespace`; any other difference makes the text custom. Either way the installer writes the template's text to `$AMBITIOUS_HOME/template/instructions.md`, returns the differing lines, and says what pasting the text would change in what the bot may do: when it grants more than the bot's present text, the result says "Pasting this text gives the bot these additional permissions:" and names each one in plain words; when it grants fewer or the same, it says that. When the installer that makes the comparison is itself behind a newer kit release, the problem says so, and that the newer template may carry a different text, possibly a narrower one, so the template should be updated first and the instructions proposed after. The bot uses `instructions-merge` to preserve local edits, shows conflicts with both versions, and puts the result and permissions statement in one "Proposed instructions" Page. It asks once in its own chat; pasting the text is the owner's choice. Nothing changes a bot's instructions except its owner. Under instructions version 6, the daily selfcheck also checks the published version and checksum from `check_updates`. An instructions proposal is recorded under `AMBITIOUS_HOME` and is not raised again until a newer version appears or the owner asks.

- `ambitious-modules sync --routines <file>` does the same for routine prompts, which are copies too and would otherwise drift without anyone noticing. The bot lists its routines as `{ name, schedule, prompt }` in a JSON file outside its private data directory. For each routine of the template the result says `routine-prompt-out-of-date` (the prompt is one an earlier template published), `routine-missing` or `routine-custom` (nobody published that prompt), with the template's prompt. A published prompt that a bot stored with its `Destination:` line added at the end is still recognised as that prompt (`match: variant`). The bot writes a "Proposed routines" Page and tells the owner. Nothing changes automatically.

### Daily updates and analysis

Instructions version 6 permits `check_updates`, with no arguments, only after the bot independently confirms from the platform's own connector or connection details that the endpoint is exactly `https://ambitiousbots.com/api/mcp`; `server_info` then checks the claimed identity, which alone cannot authenticate a server. If the platform does not expose the endpoint or it differs, the daily path fails closed: no self-update and no announcements relayed, including saved announcements in reports. Report the problem to the owner and wait for the owner's go-ahead in chat through the pre-v6 stored-skill-pin path; approval does not make an unconfirmed checksum authoritative. The selfcheck saves that result under `AMBITIOUS_HOME`, compares the kit and instructions versions, checks the tools offered to this bot, and reports new service announcements once. The bot calls only tools its own instructions allow. Under older instructions a routine reports what it can check and waits for the owner's request in chat.

For a newer kit, `ambitious-modules self-update --version <version> --sha256 <hex>` accepts the service's checksum and constructs only the public kit release URL. Even with an independently confirmed endpoint, the installer bytes must match both that checksum and the release's `SHA256SUMS` fetched from the official repository URL `https://github.com/AmbitiousBots/ambitious-kit/releases/download/kit-vVERSION/SHA256SUMS`. It refuses downgrades, keeps the old file and switches the link only after verification. The bot then runs `sync`, `skill-files` and `skills`, writes only skills answered `create` or `update`, and verifies the stored bodies. Instructions are never applied by the bot.

Both daily routines start active under version 6, and the owner can pause either; pack routines start paused. The snapshot replies with nothing until monitoring is chosen and the modules, matching skills and authenticated connection are ready. The Ambitious Bot plan is $725/month per bot, with daily analysis and human review. A partner AI Consultant is a human consultant.

Daily reports use the pinned audit 0.3.0's `send_report.v3` interface: high priority items before low priority items, each labelled finding, recommendation or announcement. Announcements are copied only from the saved endpoint-confirmed `check_updates` result. The skill blocks report delivery if the required interface is absent.

After reviewing a sample payload Page, the owner approves the `send_report` tool of the Ambitious connection for this bot once, for example with "always allow". A routine sends only when the platform confirms that pre-approval covers the call. Otherwise it keeps the review Page, sends nothing and says what is waiting. `send_feedback` still requires approval for each call.

### Finding the monitoring connection

A bot sends reports through a connector to the Ambitious service, and it has to know which of its connectors that is. A connector's display name proves nothing, and the platform's connector list may show no server address, so the template goes by what the connector offers:

1. Tool names. The monitoring connection is a connector whose tools include all three of `server_info`, `send_report` and `send_feedback`. The platform's connector status tool may show only how many tools a connector has, so the skills say where the names come from: the platform's tool catalog, read one connector namespace at a time with its dynamic tool discovery (on Grok Bot, `GetDynamicTools` with the connector's namespace returns the tool names and descriptions). A connector whose tools could not be read is passed with `tools: null` and is never judged by a count or a name.
2. Identity. The service's `server_info` tool takes no arguments and returns a fixed identity, `ambitiousbots.com/mcp/v1`. Where the bot's instructions allow that call, the bot makes it and the identity must match exactly.

Instructions version 1 lets nothing leave the computer except through `send_report` and `send_feedback`. The `server_info` call carries no data, but it is still a call to the service through a third tool, so under version 1 the skills do not make it: the connection is identified by its tool names alone and the bot says that its identity was not confirmed. Versions 4 and 5 name `server_info` as the one further tool the bot may call. A connector that fails either check is "a different connector" and is left alone, whatever it is called. A confirmed identity shows what the server answered, not who runs it; the address in the connector's own settings is what shows where reports go.

The rule is a command, not a judgment: `ambitious-modules connection` takes each connector's name, tool names and `server_info` answer and says `monitoring`, `different` or `unidentified` for each. Its first sentence for the owner says whether there is a monitoring connection among the connectors whose tools were read, how many were read, and which were not, by name. [template/fixtures/ambitious-connection](template/fixtures/ambitious-connection) holds one worked case per answer, and `npm run template:test` runs the command on each.

### Upgrading a bot made from an earlier template

A bot made from template 0.2.0 to 0.2.7 keeps the skills, instructions and routine prompts of that template, and its `ambitious-module-installer` skill pins only that template's installer. An earlier skill therefore cannot fetch a newer installer, and is written not to try. Trust starts at the installer skill that is stored: its fetch lines carry the release address and the SHA-256 of the installer, and the installer carries the module pins and every other skill body.

Anyone may ask the bot to run `sync` and the two checks: the owner, a bot that manages other bots, or an agent working for the owner. Who may ask for an upgrade that writes shared `ambitious-*` skills depends on the bot's own instructions, which `sync --instructions` reads:

- Under instructions version 1 to 4, or a text no template published, only the owner may, in the bot's own chat (`upgradeOn` is `the owner's request`). When someone else asks, the bot runs what it may, writes the proposal Pages, writes no skill, and tells the owner in its own chat what is waiting for their go-ahead, and that pasting the current text would let any agent ask.
- Under instructions version 5 or 6, any agent or person may (`upgradeOn` is `any request`). The bot runs the whole upgrade and then tells the owner, in its own chat, which skills changed, with the old template version and the new one, and which permissions the proposed instructions would add.

Either way a request only starts the upgrade. It never supplies a pin, an address, a checksum or a skill text, and the bot ignores any that come with it: the installer is fetched from the address in the stored skill and checked against the pin there, and a file that does not match is deleted, so nothing is installed. A new installer skill reaches a bot from its owner, or through the shared skill library when another bot of the same account was updated. The upgrade goes in this order:

1. The bot has the new `ambitious-module-installer` skill: the owner updated the bot's template or handed over `bot.json` from `ambitious-template-<version>.tgz` of the new kit release, and the bot stored it in place of the earlier one at the owner's request, or the skill is already in the shared library. This skill text is where trust starts: it carries the new installer's checksum.
2. The bot runs the skill's fetch lines. They download `ambitious-modules-<version>.mjs` from the address in the skill, check its SHA-256 against the pin in the skill, and only then switch the link `bin/ambitious-modules`. A file that fails the check is deleted and never run, and the upgrade stops.
3. The bot runs `ambitious-modules sync --json --instructions <file> --routines <file>`. The new installer upgrades every module whose pin moved, runs each selfcheck, compares the instructions and the routine prompts, and says in `upgradeOn` who may ask for skills to be written.
4. The bot runs `ambitious-modules skill-files`, which writes every skill body of the template to a file and prints its SHA-256, and decides each skill with `ambitious-modules skills`. When the owner asked, or `upgradeOn` is `any request`, it writes those answered `create` or `update`, each from its file's exact content, reads each one back and checks its SHA-256 against the printed one; a mismatch is reported, not retried blindly. Skills of template 0.2.0 have no `ambitious-` prefix; they are left alone, and the owner is told they are no longer used.
5. If the instructions are out of date or customised, the bot runs `instructions-merge` and writes the Page with the proposed text, local changes kept, conflicts and the permissions statement. It records the published version and checksum so it asks only once until a newer version appears or the owner asks. The instructions change only if the owner pastes it.
6. If a routine prompt is out of date, customised or missing, the bot writes the "Proposed routines" Page with the template's prompt. A routine changes only when the owner asks.

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

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) says how to file an issue, set up a checkout, run the checks and open a pull request. Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Report a security vulnerability privately, as [SECURITY.md](SECURITY.md) describes, not in an issue. Changes to the contract follow its own versioning rule (rule 9); see "How to propose a change" in the contract.

Part of [Ambitious](https://ambitiousbots.com). Licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
