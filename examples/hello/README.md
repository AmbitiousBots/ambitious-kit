# ambitious-hello

The smallest module built on the kit. It stores greetings and lists them. It exists to show the layout every `ambitious-<module>` has and to prove that the kit's lint rules, dependency rules, contract tests and model checks pass on a real module. Copy it when you start a module.

## Commands

Every command accepts `[--in file] [--db path] [--now ISO8601] [--seed int] [--json] [--help]` and prints one JSON envelope, as the [module contract](../../MODULE_CONTRACT.md) describes.

| Command | Kind | Input | What it does |
|---|---|---|---|
| `greet` | write | `{ "name": "world" }`, 1 to 100 characters | Stores a greeting for the name and returns it in `data.greeting`. `--seed` chooses the opening words and `--now` is the stored time. |
| `list` | read | none | Returns every stored greeting, oldest first, in `data.greetings`. |
| `selfcheck` | write | none | Creates the database if it is missing, applies pending migrations and reports the runtime, the binary checksum and the database state. Provided by the kit. |
| `commands` | no database | none | Lists every command with its kind, whether it takes input and, for `greet`, its input fields and one example. `--help` answers the same listing, and `greet --help` only the entry for `greet`, without running anything. Provided by the kit. |

```text
$ echo '{"name":"world"}' | node dist/ambitious-hello.mjs greet --now 2026-01-01T00:00:00Z --seed 7
{"ok":true,"schemaVersion":1,"module":"hello","command":"greet","data":{"greeting":{"id":1,"name":"world","text":"Hello, world.","createdAt":"2026-01-01T00:00:00.000Z"}},"errors":[],"meta":{"now":"2026-01-01T00:00:00.000Z","seed":7,"version":"0.4.10"}}
```

## Error codes

| Code | Exit | Meaning | Typical hint |
|---|---|---|---|
| `E_USAGE` | 1 | Unknown command or flag, or a `--now` or `--seed` value that does not parse. | The valid commands or the expected flag format. |
| `E_INPUT_SCHEMA` | 1 | `greet` got no input, input that is not JSON, or a `name` that is not 1 to 100 characters. | Send input like `{ "name": "world" }`. |
| `E_FORBIDDEN_PATH` | 1 | A path is under the bot's private data directory, `/home/box/agent-data/`. | Use a path under `AMBITIOUS_HOME`. |
| `E_DB` | 2 | The database cannot be opened, read or written. | Run `selfcheck` and read `data.problems`. |
| `E_MIGRATION` | 2 | `list` ran before `selfcheck` or `greet` created the database, or the database is newer than the binary. | Run `selfcheck`, or install the newer binary. |
| `E_INTERNAL` | 2 | A bug. | Report it with the stderr log. |

The module has no codes of its own.

## Layout

| Path | What it holds |
|---|---|
| `src/cli/main.ts` | The command table handed to the kit's `runCli`. Nothing else. |
| `src/domain/greeting.ts` | Input checking and the greeting itself: pure functions that take the clock and the random source as arguments. |
| `src/db/greetings.ts` | The two SQL statements. |
| `migrations/0001_create_greetings.sql` | The database schema, with its test in `test/migrations/`. |
| `spec/` | A TLA+ model of the greeting log and a broken variant the model checker must catch. |
| `scripts/build.mjs` | Bundles everything, the migrations included, into the single file `dist/ambitious-hello.mjs`. |

## Build and check

From the repository root, after `npm ci`:

```text
npm run build
node examples/hello/dist/ambitious-hello.mjs selfcheck --now 2026-01-01T00:00:00Z
npm run contract -- examples/hello/dist/ambitious-hello.mjs
```
