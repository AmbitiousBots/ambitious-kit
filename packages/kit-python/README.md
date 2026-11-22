# ambitious_kit

The Python mirror of [`@ambitious/kit`](../kit): the same envelope, command-line runner, SQLite helpers, path refusal and contract tests, for modules written in Python. Python 3.13, standard library only.

| Import | What it gives you |
|---|---|
| `ambitious_kit.cli.runner` | `run_cli(spec)` and `ModuleSpec`: parses the arguments, reads input, opens the database, runs the command, prints the one envelope and returns the exit code. Adds `selfcheck` and `commands` to every module, and answers `--help` with the same listing in one envelope. |
| `ambitious_kit.cli.command` | `read_command`, `write_command`, `pure_command`, `no_input`, and the `Context` and `DbContext` a command receives. A command that takes input may pass an `InputShape` as its third argument, which `commands` and `--help` then list. |
| `ambitious_kit.domain.input_shape` | `InputShape`, `InputField`, `FIELD_TYPES`, and `shape_problems`, which `run_cli` uses to refuse a wrong shape as a spec problem. |
| `ambitious_kit.domain.actor` | `parse_actor(raw)`: the one rule for who made a write. 1 to 200 Unicode characters, no control characters or line breaks, no half of a surrogate pair, no leading or trailing whitespace; internal spaces are allowed and nothing is trimmed. Anything else is `E_INPUT_SCHEMA` with the rule, `ACTOR_RULE`, in the hint. |
| `ambitious_kit.domain.envelope` | `ok`, `err`, `failure`, `Failure`, `envelope_problems` and the envelope types. |
| `ambitious_kit.domain.clock` | `parse_now`, `parse_seed`, `format_instant`. |
| `ambitious_kit.db.sqlite` | `open_db(path, readonly=...)`, `migrate`, `load_migrations`, `require_current_schema`, `integrity_check`. |
| `ambitious_kit.paths` | `refuse_agent_data(path)` and `ambitious_home(environment)`. |
| `ambitious_kit.domain.json_schema` | `schema_problems(schema, value)`: checks a document against an interchange schema from `schemas/interchange/`. |
| `ambitious_kit.runtime` | `pinned_runtime(env, module, lock_text)`, `activate(runtime)` and `runtime_failure(runtime)`: find the module's opt-in pinned runtime by the SHA-256 of its lock, put it on the import path, or fail with `E_RUNTIME`. Pass the lock text as `ModuleSpec.runtime_lock` and `selfcheck` reports it in `data.pinnedRuntime` and `data.warnings`. |
| `ambitious_kit.contract` | The contract tests: `python -m ambitious_kit.contract <binary>`. |
| `ambitious_kit.build` | `build_zipapp(target, packages, main)`: writes the module's `.pyz`, byte for byte the same on every build. |

It behaves like the TypeScript kit, with Python's own types: a command receives `context.now` (a `datetime` in UTC, the `--now` instant) and `context.rng` (a `random.Random` seeded from `--seed`). A command that takes input passes its parse function; one that takes none passes `no_input`:

```python
commands = {
    "greet": write_command(
        greet, parse_greeting_request, InputShape([InputField("name", "string", True)], {"name": "world"})
    ),
    "list": read_command(list_greetings, no_input),
}
```

[`examples/hello`](examples/hello) is the hello module in Python. Its `build.py` bundles the module and this package into `dist/ambitious-hello.pyz`, which runs with only `python3`.

## Use it in a module

A kit release has `ambitious_kit-<version>.pyz`. It is a zip file: unpack it into the module repository with `python3 -m zipfile -e ambitious_kit-0.4.9.pyz vendor/`, so the `ambitious_kit` package can be imported, and let `build_zipapp` put it and the module's own package into the module's `.pyz`. The same file also runs the contract tests on its own:

```text
python3 ambitious_kit-0.4.9.pyz dist/ambitious-<module>.pyz
```

## Checks

From the repository root, with the pinned tools installed (`mise trust && mise install`):

```text
npm run test:python       the unit tests, and the contract tests against broken binaries
npm run lint:python       no code comments
npm run build:python && npm run contract:python
```

`contract:python` runs the Python contract tests on the Python example and on the TypeScript example, and the TypeScript contract tests on the Python example, so the two suites are held to each other. The code also passes `ruff` and `mypy --strict` with the configs in [`packages/lint/python`](../lint/python); the comment checker there is the part that runs in CI.
