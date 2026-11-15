# Module contract

Every `ambitious-<module>` repository follows this contract. A module is a single-purpose command-line tool with no user interface. A bot runs it, passes JSON in, and reads JSON out.

The words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119. Part 1 states the ten rules. Part 2 lists the shared error codes. Part 3 gives a worked example for each rule and fixes the details the rules leave open. Part 4 lists the gates a module passes before a release.

Machine-checked parts of this contract:

| What | Where | Checked by |
|---|---|---|
| Envelope shape | `schemas/envelope.v1.json` | `npm run check:contract` |
| Valid and invalid envelope examples | `examples/envelopes/` | `npm run check:contract` |
| Every envelope printed in this file | this file | `npm run check:contract` |

Everything else in this file becomes machine-checked when the shared kit, lint rules and contract test suite ship as `kit-v0.1.0`. Until that tag exists, modules MUST NOT merge code.

## Part 1: the ten rules

### 1. CLI

A module MUST ship exactly one binary, invoked as:

```text
ambitious-<module> <command> [--in file] [--db path] [--now ISO8601] [--seed int] [--json]
```

Input JSON MUST be read from stdin or from the file named by `--in`. Output MUST be written to stdout and MUST always be one JSON envelope:

```json
{ "ok": true, "schemaVersion": 1, "module": "tasks", "command": "next", "data": {}, "errors": [], "meta": { "now": "2026-01-01T00:00:00.000Z", "seed": 7, "version": "0.1.0" } }
```

On error the envelope MUST have `ok: false` and `errors: [{ "code": "E_CYCLE", "message": "plain words", "hint": "how to fix" }]`, and the process MUST exit with code 1 (user error) or 2 (internal error). A module MUST NOT write anything else to stdout. Logs MUST go to stderr.

### 2. Determinism

Module logic MUST NOT read the clock or a random number generator. `--now` and `--seed` MUST be given defaults only in the CLI shell, and MUST be echoed in the output `meta`.

### 3. Data

A module MUST keep its data in one SQLite file, by default `/workspace/ambitious/<module>/<module>.sqlite`, overridable with `--db` or `AMBITIOUS_HOME`. `PRAGMA user_version` MUST equal the database schema version. Migrations MUST be forward-only files named `migrations/NNNN_name.sql`, and each MUST have a test. The database MUST use WAL mode and `foreign_keys=ON`. Analysis commands MUST open the database with `mode=ro`. A module MUST refuse any path under `/home/box/agent-data/` with `E_FORBIDDEN_PATH`.

### 4. Documents

A module MUST NOT render documents. The bot writes Grok Bot Pages; a module MAY store a Page reference `{ pageId, version, sha256 }`.

### 5. Install

A module MUST be released as one asset, either `ambitious-<module>-<semver>.mjs` (TypeScript, Node 24, a single bundled file, no `npm install`) or `ambitious-<module>-<semver>.pyz` (Python 3.13 zipapp, standard library or vendored dependencies), plus a `SHA256SUMS` file. The installer MUST write to `/workspace/ambitious/bin`, MUST be idempotent, MUST verify the checksum, and MUST be safe to run on every routine start.

### 6. `selfcheck`

Every module MUST provide a `selfcheck` command that reports the runtime version, the binary checksum, the result of `PRAGMA integrity_check` and the schema version, runs pending migrations, and lists what is wrong in `data.problems[]` in plain words.

### 7. Keys

A module MUST make AI calls only with a key passed as an environment variable for that call (`XAI_API_KEY` and similar). A key MUST NOT be written to disk, the database, logs or output. With no key, a command MUST take a deterministic path or fail with `E_NO_KEY`.

### 8. Network

A module MUST NOT use the network, except for the installer download and keyed AI calls. Lint MUST enforce this: no `fetch`, `http` or `net` imports outside `src/ai/` and the installer.

### 9. Versioning

A module MUST use semantic versioning. The envelope `schemaVersion` MUST be bumped on every breaking output change.

### 10. Verification bar and license

A module MUST pass the verification bar before a release (see Gates below). A module MUST be licensed Apache-2.0.

## Part 2: shared error codes

Every module uses these codes with these meanings and exit codes.

| Code | Exit | Meaning | Typical hint |
|---|---|---|---|
| `E_USAGE` | 1 | Unknown command or flag, a flag value that does not parse (`--now`, `--seed`), or both stdin and `--in` given. | Name the valid commands or the expected flag format. |
| `E_INPUT_SCHEMA` | 1 | Input is missing, is not JSON, or does not match the command's input schema. | Name the field and what it must be. |
| `E_FORBIDDEN_PATH` | 1 | A path resolves under `/home/box/agent-data/`. | Use a path under `/workspace/ambitious`. |
| `E_NO_KEY` | 1 | The command needs an AI call and the key environment variable is not set. | Name the environment variable to set for this call. |
| `E_DB` | 2 | The database cannot be opened, read or written, or fails `PRAGMA integrity_check`. | Run `selfcheck` and read `data.problems`. |
| `E_MIGRATION` | 2 | A migration failed, the database is behind the binary on a read-only open, or the database is newer than the binary. | Run `selfcheck`, or install the newer binary. |
| `E_INTERNAL` | 2 | Anything the module did not expect: a bug. | Report it with the stderr log. |

Exit code rules:

- Exit 0 MUST mean `ok: true`. Exit 1 and exit 2 MUST mean `ok: false`. No other exit code is used.
- Exit 1 means the caller can fix it by changing the input, the flags or the environment. Exit 2 means the module or its data is broken.
- When `errors` holds more than one entry, the exit code MUST be 2 if any entry is an exit-2 code, otherwise 1.

How a module adds its own codes:

- A module-specific code MUST match `E_[A-Z0-9_]+` (for example `E_CYCLE`, `E_TRANSITION`) and MUST NOT reuse a shared code name with a different meaning.
- A module-specific code MUST exit 1. Internal failures use the shared exit-2 codes.
- Each module MUST list its codes in a table in its README with the same columns as above.
- Structured detail about an error (for example the ids in a cycle) MUST go in `data`, not in the error object. An error object holds only `code`, `message` and `hint`.
- Removing or renaming a released code, or changing its exit code, is a breaking output change (rule 9).

## Part 3: worked examples

### Rule 1: envelopes and exit codes

Success. Exit code 0.

```text
$ echo '{}' | ambitious-tasks next --now 2026-01-01T00:00:00Z --seed 7
```

```json
{
  "ok": true,
  "schemaVersion": 1,
  "module": "tasks",
  "command": "next",
  "data": { "task": { "id": "T-12", "title": "Write the release notes" }, "reasons": ["all dependencies done", "earliest due date"] },
  "errors": [],
  "meta": { "now": "2026-01-01T00:00:00.000Z", "seed": 7, "version": "0.1.0" }
}
```

User error. Exit code 1. The caller asked for something the module will not do; the hint says how to fix it.

```text
$ ambitious-tasks dep add --in dep.json --now 2026-01-01T00:00:00Z --seed 7; echo "exit $?"
```

```json
{
  "ok": false,
  "schemaVersion": 1,
  "module": "tasks",
  "command": "dep add",
  "data": { "cycle": ["T-12", "T-9", "T-12"] },
  "errors": [
    {
      "code": "E_CYCLE",
      "message": "T-12 cannot depend on T-9 because T-9 already depends on T-12.",
      "hint": "Remove the dependency of T-9 on T-12 first, or choose a different task."
    }
  ],
  "meta": { "now": "2026-01-01T00:00:00.000Z", "seed": 7, "version": "0.1.0" }
}
```

```text
exit 1
```

Internal error. Exit code 2. Nothing the caller sent was wrong.

```json
{
  "ok": false,
  "schemaVersion": 1,
  "module": "tasks",
  "command": "add",
  "data": {},
  "errors": [
    {
      "code": "E_DB",
      "message": "The database file could not be opened for writing.",
      "hint": "Run ambitious-tasks selfcheck and read data.problems."
    }
  ],
  "meta": { "now": "2026-01-01T00:00:00.000Z", "seed": 7, "version": "0.1.0" }
}
```

Details fixed by this contract:

- The envelope MUST validate against `schemas/envelope.v1.json`. It has exactly seven fields: `ok`, `schemaVersion`, `module`, `command`, `data`, `errors`, `meta`. No other top-level field is allowed.
- `ok: true` MUST come with `errors: []`. `ok: false` MUST come with at least one error.
- `data` MUST be a JSON object, never a list or a bare value, so fields can be added later. It is `{}` when there is nothing to report. On an error it MAY carry structured detail.
- `module` is the name after `ambitious-`. `command` is the command words joined by one space (`"dep add"`). When no known command was given, `command` is `""` and the error is `E_USAGE`.
- stdout MUST hold the envelope on a single line, UTF-8, ended by one newline. The examples in this file are wrapped for reading.
- `--json` MUST be accepted by every command and changes nothing, because output is always JSON. A bot can pass it always.
- `--in` takes a file path, not inline JSON. Giving both `--in` and non-empty stdin is `E_USAGE`. A command that needs input and gets none fails with `E_INPUT_SCHEMA`.
- Input MUST be parsed and checked against the command's input schema at the CLI boundary before any logic runs. Input that is not JSON or does not match is `E_INPUT_SCHEMA`, exit 1.
- Usage errors MUST still produce an envelope on stdout. A module MUST NOT print help text, stack traces or progress to stdout.
- An unexpected exception MUST be caught at the top of the CLI and reported as `E_INTERNAL`, exit 2, with the stack trace on stderr only.

### Rule 2: `--now` and `--seed` echoed in `meta`

```text
$ ambitious-tasks next --now 2026-03-05T09:30:00+01:00 --seed 42
```

```json
{
  "ok": true,
  "schemaVersion": 1,
  "module": "tasks",
  "command": "next",
  "data": {},
  "errors": [],
  "meta": { "now": "2026-03-05T08:30:00.000Z", "seed": 42, "version": "0.1.0" }
}
```

Details fixed by this contract:

- `meta` has exactly three fields: `now`, `seed` and `version`.
- `meta.now` is the instant the command used, always written in UTC with milliseconds: `YYYY-MM-DDTHH:MM:SS.sssZ`. `--now` MUST include a time zone (`Z` or an offset); a value without one, or one that does not parse, is `E_USAGE`.
- `meta.seed` is an integer from 0 to 4294967295. A value outside that range is `E_USAGE`.
- `meta.version` is the semantic version of the binary that produced the output.
- When `--now` is omitted, the CLI shell reads the system clock once. When `--seed` is omitted, the CLI shell draws one seed from the system. Both are echoed, so any run can be replayed by passing the echoed values back.
- Same binary, same database state, same input, same `--now`, same `--seed`: stdout MUST be byte-for-byte identical.
- Only `src/cli/` may touch the clock or system randomness. Logic receives a clock and a random source as arguments.

### Rule 3: database path, migrations, read-only opens, forbidden paths

Path resolution, first match wins:

| Given | Database file |
|---|---|
| `--db /tmp/x/tasks.sqlite` | `/tmp/x/tasks.sqlite` |
| `AMBITIOUS_HOME=/tmp/home` | `/tmp/home/tasks/tasks.sqlite` |
| neither | `/workspace/ambitious/tasks/tasks.sqlite` |

`AMBITIOUS_HOME` replaces `/workspace/ambitious` everywhere, including the `bin` directory in rule 5.

Migration files:

```text
migrations/
  0001_create_greetings.sql
  0002_add_greeting_index.sql
test/migrations/
  0001_create_greetings.test.ts
  0002_add_greeting_index.test.ts
```

```sql
CREATE INDEX greetings_by_created_at ON greetings (created_at);
```

```text
$ sqlite3 /workspace/ambitious/hello/hello.sqlite 'PRAGMA user_version; PRAGMA journal_mode;'
2
wal
```

`foreign_keys` is a per-connection setting in SQLite, so the module MUST run `PRAGMA foreign_keys=ON` on every connection it opens.

Details fixed by this contract:

- `NNNN` is four digits, starts at `0001` and has no gaps. `PRAGMA user_version` is the number of the last migration applied.
- The migration runner MUST apply each file inside one transaction that also sets `user_version`, so a failed migration leaves the database at the previous version. A migration file MUST NOT contain `BEGIN`, `COMMIT` or `PRAGMA user_version`.
- A released migration file MUST NOT be edited or deleted. A change is a new file.
- Each migration's test applies all earlier migrations to a temporary database, inserts representative rows, applies the migration, and asserts that the rows survived and `user_version` is right.
- Write commands and `selfcheck` create the database if it is missing and apply pending migrations before doing anything else.
- A database whose `user_version` is higher than the binary knows MUST be refused with `E_MIGRATION`. A module never downgrades a database.
- Each module's README MUST mark every command as `read` (analysis) or `write`.

Read-only analysis open. Analysis commands open the file with SQLite's `mode=ro` and never create, migrate or write it:

```text
file:/workspace/ambitious/tasks/tasks.sqlite?mode=ro
```

In TypeScript modules this is the kit's `openDb(path, { readonly: true })`; in Python modules it is `sqlite3.connect("file:...?mode=ro", uri=True)`. If the database is missing or behind the binary, an analysis command fails with `E_MIGRATION` and the hint to run `selfcheck`.

Forbidden path. Exit code 1. Nothing is opened or created.

```text
$ ambitious-tasks next --db /home/box/agent-data/tasks.sqlite --now 2026-01-01T00:00:00Z --seed 7
```

```json
{
  "ok": false,
  "schemaVersion": 1,
  "module": "tasks",
  "command": "next",
  "data": {},
  "errors": [
    {
      "code": "E_FORBIDDEN_PATH",
      "message": "The path /home/box/agent-data/tasks.sqlite is under /home/box/agent-data/, which modules never read or write.",
      "hint": "Use a path under /workspace/ambitious, or omit --db to use the default."
    }
  ],
  "meta": { "now": "2026-01-01T00:00:00.000Z", "seed": 7, "version": "0.1.0" }
}
```

The check MUST apply to every path the module is given: `--db`, `--in`, `AMBITIOUS_HOME`, and any file path inside the input JSON. It MUST run on the path after relative segments and symbolic links are resolved, and before any file is opened or created.

### Rule 4: Page references

The bot writes the document as a Grok Bot Page and hands the module a reference. The module stores it and can later compare it.

```json
{
  "pageId": "pg_7f3a2c",
  "version": 3,
  "sha256": "4a75ab26b9047bbb1e89e8c47545aa668a01a3186e8ed8e629518c3aab6576d9"
}
```

- `pageId` is the Page's identifier as an opaque string. `version` is the Page version as an integer, 1 or higher. `sha256` is 64 lowercase hex characters: the SHA-256 of the Page content at that version, computed by the bot.
- A module MUST NOT fetch, write or render a Page. It only stores the three values the bot passes and compares them with values the bot passes later.
- A module MUST NOT produce PDF, HTML, slides or any other rendered document.

### Rule 5: release assets and the installer

A release of `ambitious-tasks` version 0.3.1, tagged `tasks-v0.3.1`, has exactly these assets:

```text
ambitious-tasks-0.3.1.mjs
SHA256SUMS
```

`SHA256SUMS` uses the `sha256sum` format, one line per asset:

```text
b0188e246a775713d6d02c2201e5417b2f2101a902409497e132c1cb9140f94c  ambitious-tasks-0.3.1.mjs
```

After install:

```text
/workspace/ambitious/bin/
  ambitious-tasks-0.3.1.mjs      the verified asset, executable
  ambitious-tasks                link to the current asset
  SHA256SUMS                     the verified checksum line for each installed asset
```

Installer behavior, for a requested module and exact version:

| State before | What the installer does |
|---|---|
| Nothing installed | Downloads the asset and `SHA256SUMS` to a temporary file in `bin`, verifies the checksum, moves the asset into place, updates the link. |
| Requested version installed, checksum matches | Nothing. No download, no write. |
| Requested version installed, checksum does not match | Downloads again, verifies, replaces the file. |
| Another version installed | Installs the requested version beside it, then switches the link. |
| Download fails or its checksum does not match | Deletes the temporary file, leaves the existing install and link untouched, exits non-zero. |

- The installer MUST install an exact version. It MUST NOT resolve "latest".
- Every file MUST be put in place by a rename within `bin`, so an interrupted run never leaves a half-written binary.
- The installer MUST NOT read, create or change any module database.
- The asset MUST run with only the runtime present: `node` 24 for `.mjs`, `python3` 3.13 for `.pyz`. It MUST NOT need `npm install`, `pip install` or any other file.

### Rule 6: `selfcheck`

```text
$ ambitious-hello selfcheck --now 2026-01-01T00:00:00Z --seed 7
```

```json
{
  "ok": true,
  "schemaVersion": 1,
  "module": "hello",
  "command": "selfcheck",
  "data": {
    "runtime": { "name": "node", "version": "24.11.0" },
    "binary": {
      "path": "/workspace/ambitious/bin/ambitious-hello-0.1.0.mjs",
      "sha256": "2c0fe275a7597255d97fd47be41e75e2bf911c493b7a85c44096202aaaf5ba39"
    },
    "db": {
      "path": "/workspace/ambitious/hello/hello.sqlite",
      "integrityCheck": "ok",
      "userVersion": 2,
      "migrationsApplied": ["0002_add_greeting_index"]
    },
    "problems": []
  },
  "errors": [],
  "meta": { "now": "2026-01-01T00:00:00.000Z", "seed": 7, "version": "0.1.0" }
}
```

When something is wrong, `selfcheck` still reports everything it could read. Exit code 2.

```json
{
  "ok": false,
  "schemaVersion": 1,
  "module": "hello",
  "command": "selfcheck",
  "data": {
    "runtime": { "name": "node", "version": "24.11.0" },
    "binary": {
      "path": "/workspace/ambitious/bin/ambitious-hello-0.1.0.mjs",
      "sha256": "2c0fe275a7597255d97fd47be41e75e2bf911c493b7a85c44096202aaaf5ba39"
    },
    "db": {
      "path": "/workspace/ambitious/hello/hello.sqlite",
      "integrityCheck": "row 14 missing from index greetings_by_created_at",
      "userVersion": 2,
      "migrationsApplied": []
    },
    "problems": ["The database failed its integrity check: row 14 missing from index greetings_by_created_at."]
  },
  "errors": [
    {
      "code": "E_DB",
      "message": "The database failed its integrity check.",
      "hint": "Restore hello.sqlite from a backup, then run selfcheck again."
    }
  ],
  "meta": { "now": "2026-01-01T00:00:00.000Z", "seed": 7, "version": "0.1.0" }
}
```

- `data` always has `runtime`, `binary`, `db` and `problems`. `db.userVersion` is `PRAGMA user_version` after pending migrations ran; `db.migrationsApplied` lists the migrations this run applied.
- `ok` is `true` exactly when `problems` is empty. Each problem is one plain sentence. Failed integrity check is `E_DB`; failed migration or a database newer than the binary is `E_MIGRATION`; anything else is `E_INTERNAL`.
- `selfcheck` takes no input and is safe to run on every routine start: with nothing to migrate and nothing wrong it changes nothing.

### Rule 7: keys and `E_NO_KEY`

The key is set for one call and exists only in that process's environment:

```text
$ XAI_API_KEY=... ambitious-contracts extract --in contract.json
```

A command that cannot work without AI, run with no key. Exit code 1.

```json
{
  "ok": false,
  "schemaVersion": 1,
  "module": "contracts",
  "command": "extract",
  "data": {},
  "errors": [
    {
      "code": "E_NO_KEY",
      "message": "This command needs an AI call and no key was provided.",
      "hint": "Set XAI_API_KEY in the environment for this call."
    }
  ],
  "meta": { "now": "2026-01-01T00:00:00.000Z", "seed": 7, "version": "0.1.0" }
}
```

- A key MUST come only from an environment variable. A module MUST NOT accept a key as a flag, in input JSON or from a file.
- A key MUST NOT appear in the database, in any file, on stdout, on stderr or in an error message.
- A command that has a deterministic path MUST take it when no key is set, and succeed. `E_NO_KEY` is only for commands with no such path.
- An AI response is outside input: it MUST be parsed and checked at the boundary in `src/ai/` like any other input.

### Rule 8: network

Only two places may use the network, and each for one purpose:

| Directory | May use the network for |
|---|---|
| `src/ai/` | AI calls made with a key from the environment |
| `src/install/` | Downloading the release asset and `SHA256SUMS` |

Code anywhere else MUST NOT import `fetch`, `http`, `https`, `net`, `tls`, `dgram`, `dns` or a package that wraps them. In Python modules the same holds for `urllib`, `http`, `socket` and `ssl`.

This is enforced by the kit's lint rules and dependency-graph rules, which every module runs in CI. A violation looks like this, and the fix is to move the call, not to silence the rule:

```text
src/domain/rank.ts: imports node:https
  Network is only allowed in src/ai/ and src/install/. Move the call into src/ai/ and pass its result into src/domain as data.
```

Those rules ship with `kit-v0.1.0`. Until then nothing checks this rule, which is one reason module code does not merge before that tag.

### Rule 9: semver and `schemaVersion`

`schemaVersion` is one integer per module and describes that module's output. It starts at 1.

| Change | `schemaVersion` | Module version |
|---|---|---|
| Fix a bug without changing any output shape | same | patch |
| Add a command, an optional input field, or a new field in `data` | same | minor |
| Add a new module-specific error code to an existing command | same | minor |
| Remove, rename or change the type or meaning of a field in `data` | +1 | major |
| Remove or rename a command or flag, or make an optional input required | +1 | major |
| Remove or rename an error code, or change its exit code | +1 | major |
| Add a database migration | same | minor, or major if output also breaks |

- Readers of module output MUST ignore `data` fields they do not know, so adding a field is never breaking.
- Before version 1.0.0 a breaking change MAY ship in a minor version, and MUST still bump `schemaVersion`.
- The database schema version (`PRAGMA user_version`) is separate from `schemaVersion` and from the module version.
- The envelope's own shape is versioned by this contract (`schemas/envelope.v1.json`). A change to the seven fields would be a new envelope schema file and a new major version of every module.
- Release tags are `<module>-v<semver>`, for example `tasks-v0.3.1`.

### Rule 10: verification bar and license

See Part 4. Every module repository carries the Apache-2.0 `LICENSE` and a `NOTICE` file.

## Part 4: gates

A module is released only from a commit where every one of these passed in CI. A check MUST NOT be weakened or skipped to make it pass.

| Gate | What it shows |
|---|---|
| Typecheck | Types are consistent (TypeScript strict, or mypy strict for Python). |
| Lint | The kit's lint rules hold, including the comment ban and the clock, randomness and network bans. |
| Dependency graph | `src/domain` imports no IO; only `src/db` opens SQLite; only `src/ai` and `src/install` use the network; no cycles. |
| Unit and property tests | Logic behaves as specified, including on generated inputs. |
| Migration tests | Every migration has a test and keeps existing data. |
| Contract tests | The kit's suite run against the built binary: envelope shape, exit codes, `--now` determinism, agent-data refusal, read-only analysis, no stdout noise. |
| TLA+ model check | Each `spec/*.cfg` passes, and each broken variant in `spec/broken/` fails. |
| Lean proofs | Build, where the module has them. |
| `verify/run` | Every user-visible feature in `verify/features.json` passes against a fresh `AMBITIOUS_HOME`. |

A release tag is created only when all gates are green.
