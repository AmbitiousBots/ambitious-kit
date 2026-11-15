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

`src/cli/install-main.ts` is bundled to `ambitious-install-<version>.mjs` in a kit release:

```text
node ambitious-install-0.1.1.mjs <module> <version> --from <https address or directory of the release> [--kind mjs|pyz]
```

It downloads `SHA256SUMS` and the asset, compares the SHA-256, and only then moves the file into `$AMBITIOUS_HOME/bin` by a rename, records the checksum and switches the link `ambitious-<module>`. Running it again for an installed version downloads and writes nothing. The checksum shows the file is the one the release lists; it does not show who published the release. Its own error codes are `E_INSTALL_DOWNLOAD` and `E_INSTALL_CHECKSUM`, both exit code 1. `spec/` holds a TLA+ model of these steps.
