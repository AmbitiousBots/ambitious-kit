# @ambitious/kit

The shared TypeScript helpers every `ambitious-<module>` is built on. They implement the parts of the [module contract](../../MODULE_CONTRACT.md) that are the same for every module, so a module only writes its own commands. Node 24, no runtime dependencies. The kit is bundled into each module's single file at build time; a module never needs it at run time.

There is no index file. Import each name from the file that defines it:

| Import | What it gives you |
|---|---|
| `@ambitious/kit/cli/run-cli` | `runCli(spec)`: parses the arguments, reads input, opens the database, runs the command, prints the one envelope and sets the exit code. Adds the `selfcheck` and `commands` commands to every module. |
| `@ambitious/kit/cli/command` | `readCommand`, `writeCommand`, `pureCommand`: how a module declares a command and whether it reads the database, writes it, or needs none. |
| `@ambitious/kit/cli/embedded` | `embedded()`: the module name, version and migrations that the build put into the bundle. |
| `@ambitious/kit/cli/selfcheck` | `selfcheck(context)`: the report behind the `selfcheck` command. |
| `@ambitious/kit/domain/envelope` | `envelope.ok`, `envelope.err`, `exitCodeOf`, `envelopeProblems` and the envelope types. |
| `@ambitious/kit/domain/failure` | `failure(code, message, hint, data?)`: the one way a command reports an error. |
| `@ambitious/kit/domain/clock` | The `Clock` and `Rng` types that logic takes as arguments, `fixedClock` and `seededRng` for tests. |
| `@ambitious/kit/domain/json` | `JsonObject`, `JsonValue`, `isRecord` for checking input. |
| `@ambitious/kit/db/open-db` | `openDb(path, { readonly })` on `node:sqlite`, and the `Db` type. |
| `@ambitious/kit/db/migrate` | `migrate(db, migrations)`, forward-only, one transaction per file. |
| `@ambitious/kit/db/load-migrations` | `loadMigrations(directory)`: reads `migrations/NNNN_name.sql` for tests and the build. |
| `@ambitious/kit/paths/refuse-agent-data` | `refuseAgentData(path)`: throws `E_FORBIDDEN_PATH` for a path under the bot's private data directory, `/home/box/agent-data/`. |
| `@ambitious/kit/install/install` | `install(request)`: the installer behind `ambitious-install`. |
| `@ambitious/kit/build/bundle-options` | `bundleOptions({ root, module })`: the esbuild options that produce `dist/ambitious-<module>.mjs`. |
| `@ambitious/kit/contract/contract-tests` | `contractTests(binPath)`: registers the contract tests with `node:test`. |

## A module in one file

```ts
import { readCommand, writeCommand } from "@ambitious/kit/cli/command";
import { embedded } from "@ambitious/kit/cli/embedded";
import { runCli } from "@ambitious/kit/cli/run-cli";
import { listGreetings, saveGreeting } from "../db/greetings.ts";
import { greet, parseGreetingRequest } from "../domain/greeting.ts";

await runCli({
  ...embedded(),
  schemaVersion: 1,
  commands: {
    greet: writeCommand({
      input: parseGreetingRequest,
      run: ({ input, clock, rng, db }) => ({ greeting: saveGreeting(db, greet(input, clock, rng)) }),
    }),
    list: readCommand({ run: ({ db }) => ({ greetings: listGreetings(db) }) }),
  },
});
```

This is `src/cli/main.ts` of the [hello example](../../examples/hello), which is a complete module to copy.

## What the kit decides for you

- **Commands.** A command name is its words joined by one space (`"dep add"`). `input` is a function that turns the parsed JSON into your input type or throws `failure("E_INPUT_SCHEMA", ...)`; leave it out for a command that takes no input, and the kit will not read stdin for it. `run` returns the object that becomes `data`, or a promise of it.
- **Errors.** Throw `failure(code, message, hint, data?)` anywhere. The kit turns it into the error envelope and the exit code: 2 for `E_DB`, `E_MIGRATION` and `E_INTERNAL`, otherwise 1. Anything else that is thrown becomes `E_INTERNAL` (or `E_DB` when SQLite raised it), with the stack trace on stderr only.
- **Clock and randomness.** `clock.now()` is the `--now` instant for the whole command, and `rng` is seeded from `--seed`. When the flags are omitted the kit reads the system clock and draws a seed once, and echoes both in `meta`.
- **Database.** A `readCommand` gets a connection opened with `mode=ro`; if the database is missing or behind, the command fails with `E_MIGRATION` and nothing is created. A `writeCommand` gets a connection with WAL and `foreign_keys=ON`, pending migrations applied, inside one transaction: if `run` throws, nothing it wrote is kept. A `pureCommand` gets no database.
- **Paths.** `AMBITIOUS_HOME`, `--db` and `--in` are checked with `refuseAgentData` before anything is opened. Call `refuseAgentData` yourself on any file path that arrives inside the input JSON.
- **Migrations and version.** `bundleOptions` reads `migrations/*.sql` and the `version` in `package.json` and puts both into the bundle, which is why `embedded()` only works in the built file. Tests use `loadMigrations` and `migrate` directly.

## Build

```js
import { join } from "node:path";
import { bundleOptions } from "@ambitious/kit/build/bundle-options";
import { build } from "esbuild";

await build(bundleOptions({ root: join(import.meta.dirname, ".."), module: "hello" }));
```

esbuild is a development dependency of the module. The result is one file with no imports beyond Node's own modules.

## Contract tests

```text
npx ambitious-contract dist/ambitious-<module>.mjs
```

runs six checks against the built binary, each in its own temporary `AMBITIOUS_HOME`, and prints one row per check: `envelope-shape`, `exit-codes`, `now-determinism`, `agent-data-refusal`, `read-only-analysis`, `no-stdout-noise`. It works on `.mjs`, `.pyz` and any executable. To run the same checks inside the module's test suite, call `contractTests(binPath)` from a test file. The checks need only `selfcheck` and `commands`, which the kit provides, so they work on every module; they find the module's read commands through `commands`.

`test/fixtures/broken/` holds binaries that each break one rule, and `test/contract.test.ts` asserts that each is caught.

## Installer

There are two installers. `ambitious-install` puts one named module release in place. `ambitious-modules` keeps every module pinned by a kit release in place, and is the one a bot runs.

`src/cli/install-main.ts` is bundled to `ambitious-install-<version>.mjs` in a kit release:

```text
node ambitious-install-0.3.0.mjs <module> <version> --from <https address or directory of the release> [--kind mjs|pyz]
```

It downloads `SHA256SUMS` and the asset, compares the SHA-256, and only then moves the file into `$AMBITIOUS_HOME/bin` by a rename, records the checksum and switches the link `ambitious-<module>`. Running it again for an installed version downloads and writes nothing. The checksum shows the file is the one the release lists; it does not show who published the release. Its own error codes are `E_INSTALL_DOWNLOAD` and `E_INSTALL_CHECKSUM`, both exit code 1. `spec/` holds a TLA+ model of these steps.

`src/cli/modules-main.ts` is bundled to `ambitious-modules-<version>.mjs`, with the pins in `template/modules.lock.json` embedded:

```text
node ambitious-modules-0.3.0.mjs sync [--json] [--from <mirror directory>] [--lock <lock file>] [--instructions <file>] [--routines <file>]
node ambitious-modules-0.3.0.mjs skill-files [--json]
node ambitious-modules-0.3.0.mjs skills [--json] [--in <file>]
node ambitious-modules-0.3.0.mjs connection [--json] [--in <file>]
node ambitious-modules-0.3.0.mjs self-update --version <version> --sha256 <hex> [--json]
node ambitious-modules-0.3.0.mjs instructions-merge --current <file> --published <file> --published-sha256 <hex> [--json]
```

For every pinned module, `sync` runs the same install steps with one more check: the asset's SHA-256 must match the pin as well as the release's `SHA256SUMS`, so a release that was changed after it was pinned is refused. It then runs the module's `selfcheck --json` through the link in `$AMBITIOUS_HOME/bin`, with Node for an `.mjs` module and Python 3.13 for a `.pyz` one. It prints one envelope:

| Field | Meaning |
|---|---|
| `data.modules[]` | One `{ module, version, state, selfcheck, problems }` per pin. `state` is `installed`, `unchanged`, `reinstalled` (the file or link was removed or altered), `upgraded` (the pin moved) or `failed`. `selfcheck` is `ok`, `problems` or `not run`. |
| `data.problems` | Every problem in plain words, each starting with the module it concerns. |
| `data.summary` | One sentence for a person. |
| `data.notes` | Things worth knowing that are not problems: a newer template release, or that the check for one could not be made. |
| `data.template` | `version`, the kit version of this installer; `fixtures`, the directory the template's fixture files were written to; and `update`: `current`, `available` with `latest`, or `not checked` with `why`. |
| `data.instructions` | `{ state, problem, current, template, match, proposed, diff, permissions, upgradeOn }`: how the bot's instructions compare with the template's. See below. |
| `data.routines` | `{ state, routines }`: how the bot's routine prompts compare with the template's. See below. |

A module that fails does not stop the others, and `ok` stays `true`: the command ran and `data.problems` says what is wrong. `ok` is `false` only when the command could not run at all, for example `E_FORBIDDEN_PATH` for a home under `/home/box/agent-data`, the bot's private data directory. An upgrade leaves the old version's file in `bin` and switches the link only after the new file is verified. A missing Python 3.13 is a problem for the `.pyz` modules alone.

Each file is fetched from the HTTPS release address in the pin. When that is refused and the address is a GitHub release, an installed and signed-in [GitHub CLI](https://cli.github.com) (`gh release download`) is tried; the installer never reads, stores or prints a token itself. `--from <directory>`, or the environment variable `AMBITIOUS_MODULE_MIRROR`, replaces both with a local mirror: a directory that holds each release's files in a directory named after its tag, such as `tasks-v0.1.0/ambitious-tasks-0.1.0.mjs` beside that release's `SHA256SUMS`. Files from a mirror pass the same two checksum checks.

`sync` also looks up whether a newer kit release exists: the tag of the latest release of this repository, or the highest `kit-v<version>` directory name in a mirror. It only reports the answer, in `data.template` and as one entry of `data.notes`. It never downloads, installs or runs anything from a newer release: that release's `SHA256SUMS` is published by the same hand as its files, so it cannot show that the files are the ones to trust. An installer upgrade needs either the stored skill's pin or, under instructions version 6, the authenticated service checksum and the release checksum through `self-update`. A latest-release lookup alone never authorizes it. If the lookup cannot be made, that is a note, not a problem, and the embedded pins are used. `--lock <file>` uses the pins in a file instead of the embedded ones and skips the lookup; it is for tests and for an operator trying a pin, and a bot never uses it.

`sync` writes the template's fixture files, embedded at build time from `template/fixtures`, to `$AMBITIOUS_HOME/template/fixtures`, the template's instructions text to `$AMBITIOUS_HOME/template/instructions.md` and each template routine's prompt to `$AMBITIOUS_HOME/template/routines/<name>.md`, and puts back one that was altered.

`sync --instructions <file>` compares a bot's instructions with the template's. The file holds the bot's current instructions as text and must be outside the private data directory. The template's instructions carry a line `Instructions version: N`, and `template/instructions.json`, embedded at build time, lists two SHA-256 values for every text a template has published: one of the text as published, and one of the text with whitespace set aside. Setting whitespace aside means: line endings are made uniform, every run of spaces, tabs and Unicode spaces such as the non-breaking space becomes one space, spaces at either end of a line are dropped, and blank lines are dropped. `match` is `exact` when the file is a published text byte for byte, `whitespace` when it is one once whitespace is set aside, and `null` otherwise; any difference beyond whitespace makes the text `custom`. `state` is `current` (the text is the template's), `out-of-date` (it is an earlier published text, or empty), `custom` (it is not a published text), `newer` (it says a higher version than this installer knows) or `not checked` (no file was named). `problem` is `instructions-out-of-date`, `instructions-custom` or `null`; `current` and `template` are the two version numbers, with `current` `null` when the text is unpublished and has no version line. `proposed` is `$AMBITIOUS_HOME/template/instructions.md`, where every `sync` writes the template's text, and `diff` lists the differing lines with whitespace set aside, `- ` for the bot's and `+ ` for the template's. `permissions` says what pasting the template's text would change in what the bot may do: `comparison` is `more`, `fewer`, `same` or `more and fewer`; `added` and `removed` list each permission as `{ grant, permission, reason }` in the plain words of `template/instructions.json`; `statement` is one sentence for the owner, which starts "Pasting this text gives the bot these additional permissions:" whenever the text grants more; and `comparedWith` is `the bot's present text`, or `the oldest supported text` when the bot's text is not a published one and so cannot be compared. The same statement ends the entry in `data.problems`. `upgradeOn` says who may ask the bot for an upgrade that writes skills: `any request` when the bot's text is a published one whose grants include `upgrade-on-any-request`, and `the owner's request` for every other text, including one nobody published and no text at all, because the installer cannot tell what such a text allows. When this installer is itself behind (`data.template.update` is `available`), the problem entry also says that a newer template is available, that it may carry a different instructions text which may allow fewer things, and that the template should be updated first and the instructions proposed after. An out-of-date text, and a custom text that does not already say the template's version, add one entry to `data.problems` that starts with the problem's name; the other cases that are worth saying add one to `data.notes`. The command never writes to the named file: only a bot's owner changes its instructions.

`sync --routines <file>` compares a bot's routines with the template's. The file is a JSON list of `{ name, schedule, prompt }`, one entry for each routine the bot has now, outside the private data directory; other fields are ignored. `data.routines.routines` has one entry for each routine of the template: `state` is `current`, `out-of-date` (the prompt is one an earlier template published; `publishedIn` names the first template that had it), `missing` (the bot has no routine of that name) or `custom` (nobody published that prompt); `problem` is `routine-prompt-out-of-date`, `routine-missing`, `routine-custom` or `null`; `match` is `exact` or `whitespace` as above, or `variant` when the prompt is a published one with a `Destination:` line added at its end, which `template/routines.json` records for each published prompt because some copies of the template stored their routines that way; `schedule` holds the bot's schedule and the template's, and a different time is not a problem; `starts` is `active` or `paused`; `prompt` is the template's prompt and `proposed` the file that holds it. Each problem adds one entry to `data.problems`. A routine the template does not have is not looked at. The command never writes to the named file and changes no routine.

`connection` says which of a bot's connectors is the connection to the Ambitious monitoring service. Its input, on stdin or `--in`, is a list of `{ name, tools, serverInfo }`: the connector's name, the names of its tools as the platform's tool catalog lists them (`null` when they were not read), and the object its `server_info` tool returned (`null` when that tool was not called). A connector is `monitoring` when its tools include `server_info`, `send_report` and `send_feedback`; its `identity` is `confirmed` when `serverInfo.identity` is exactly `ambitiousbots.com/mcp/v1` and `not confirmed` when `server_info` was not called. It is `different` when a tool is missing, or when `server_info` answered with another identity (`identity: mismatch`), and `unidentified` when its tools were not read. The connector's name is never used. `data.monitoring` is the name of the one monitoring connection, or `null` when there is none or more than one; `data.toolsRead` is how many connectors had their tools read and `data.toolsNotRead` names the others. `data.tellOwner` has the sentences to relay: the first says whether there is a monitoring connection among the connectors whose tools were read, how many were read, and which were not. The command calls no tool and contacts no server itself.

`skill-files` writes the body of every skill of the template to `$AMBITIOUS_HOME/template/skills/<name>.md` and prints `data.skills[]`: each skill's `name`, `description`, `path`, `sha256` and `bytes`. The bodies are embedded at build time from `template/skills`, so they are covered by the same pin as the installer, and the command takes no input. One value cannot be embedded: the installer's own SHA-256, which the `ambitious-module-installer` skill carries as its pin. The build leaves that value blank and the command fills it in from the file it runs from, so the skill it writes pins exactly the installer that wrote it. A bot writes a skill from the file's exact content and then checks the stored body's SHA-256 against the printed one.

`skills` decides whether a skill may be written to a skill library that several bots share. Its input, on stdin or `--in`, is a list of `{ name, stored }`: a skill name starting with `ambitious-` and the body now stored (or `null`). The body it is compared with is the installer's own for that name; an entry may carry `candidate`, a body whose first line is `Template version: x.y.z`, only for a skill the installer does not carry. A `candidate` that differs from the installer's own body for that name is refused with `E_INPUT_SCHEMA`, so a body from anywhere else is never the one a bot is told to write. For each it answers `data.skills[].action`: `create` (nothing stored), `update` (the stored body is from an older template, or has no version line), `unchanged` (identical text) or `keep` (the stored body is from a newer template, or has the same version and different text). Each answer carries `storedSha256` and `candidateSha256`, `data.changes` has one line for each skill answered `create` or `update` with the template version it had and the one it gets, and `data.tellOwner` has one sentence for each `keep`. The command reads and writes no skill itself.

An error envelope names the command that was given: `"command": "frobnicate"` for an unknown command, and `""`, the envelope's value for no command, when none was given or the word is not a command name.

The checksums show that each module file is the one that was pinned, and the pin in the skill shows the same for the installer. Neither shows who published a release.

`self-update` downloads only the named stable kit release's installer and `SHA256SUMS` from `AmbitiousBots/ambitious-kit` on GitHub. It accepts no address, lock override or mirror. The supplied service checksum, the unique release checksum line and downloaded bytes must all match before the link changes. It compares the requested version with both the running version and the installed link, keeps old files, and serializes self-updates with a lock. A failed check leaves the working link untouched. The caller obtains the service checksum only from `check_updates` over the authenticated, identity-confirmed connection; the command itself cannot attest how a caller obtained its arguments.

| Code | Exit | Meaning | Typical hint |
|---|---|---|---|
| `E_INSTALL_DOWNGRADE` | 1 | The requested installer is older than the running or linked one. | Use the current or a newer service-published version. |
| `E_INSTALL_VERSION` | 1 | The installed link does not name a versioned installer. | Restore it from the stored installer skill. |
| `E_INSTALL_BUSY` | 1 | Another self-update holds the lock. | Wait for it; after an interrupted update the owner checks no update is running before removing the lock. |

`instructions-merge` verifies the published file against the supplied SHA-256, then merges lines against the embedded published text the current copy came from. An exact or whitespace match identifies that base; otherwise its `Instructions version` line may identify it, without granting any authority. `data.merged` preserves independent local changes, `localChangesKept` lists them, and `conflicts` shows both versions for overlapping edits. An unknown base shows both whole texts. `permissions` uses the existing permission comparison and `permissionsStatement` explicitly marks any uncertainty from custom text or conflicts. The command writes neither input file and never applies instructions. The pure line merge has a Python mirror; installers continue to be the same Node binaries for modules in both languages.
