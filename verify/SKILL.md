---
name: verify-ambitious-kit
description: Prove that the Ambitious kit works the way a module author and a bot use it, by driving the real built binaries (the hello example module, the installer, the contract tests, the release tarballs) from the command line against a fresh AMBITIOUS_HOME. Use after any change to packages/, examples/, repo-template/, scripts/ or verify/, and to produce the evidence for a pull request.
---

# Verify the kit

The kit has no user interface. Its users are module authors, who build on `packages/kit` and run its checks, and bots, which run a built module from the command line and read one JSON envelope from stdout. This skill drives those same surfaces: built files, real processes, real exit codes. One command runs everything:

```text
node verify/run
```

It prints one row per feature in `verify/features.json` and exits non-zero when any row fails. Its output is the evidence a pull request pastes under `## Evidence`.

## Launch

There is no server. "Launch" means installing the pinned tools and dependencies once:

```text
mise trust && mise install
npm ci
```

[mise](https://mise.jdx.dev) installs the Node, Python and Java versions pinned in `.mise.toml`. The first feature, `build`, bundles the example module to `examples/hello/dist/ambitious-hello.mjs` and the installer to `packages/kit/dist/ambitious-install.mjs`; later features use those files, so run the whole list or keep `build` in an `--only` selection after changing source. It is ready when `node verify/run --doctor` prints `ok` on every row.

## Doctor

```text
node verify/run --doctor
```

Read-only. It checks the Node version against `package.json`, that dependencies are installed and that the feature list is well formed. Run it first when a check fails in a way that looks unrelated to your change.

## Drive

- Everything: `node verify/run`.
- One feature: `node verify/run --only install`. Repeat `--only` for several.
- The list with each check command: `node verify/run --list`.

Each check runs from the repository root with `AMBITIOUS_HOME` set to its own new, empty temporary directory, so two runs never share a database or an install and nothing touches the default home, `/workspace/ambitious`. Runs can go side by side.

To drive a binary by hand the way a bot does, give it a home and fixed `--now` and `--seed`, then read stdout and the exit code:

```text
export AMBITIOUS_HOME="$(mktemp -d)"
node examples/hello/dist/ambitious-hello.mjs selfcheck --now 2026-01-01T00:00:00Z --seed 7; echo "exit $?"
echo '{"name":"world"}' | node examples/hello/dist/ambitious-hello.mjs greet --now 2026-01-01T00:00:00Z --seed 7
node examples/hello/dist/ambitious-hello.mjs list --now 2026-01-01T00:00:00Z --seed 7
```

The contract tests for any built module, `.mjs` or `.pyz`: `npm run contract -- <path>`. The same tests from Python: `node scripts/with-pinned-tools.mjs python3 -m ambitious_kit.contract <path>`.

## Feature map

`verify/features.json` is the map: `[{ "id", "userVisible", "check" }]`. `userVisible` is one plain sentence saying what a person can rely on. `check` is one shell command that exits 0 only when that is true. The longer checks are scripts in `verify/checks/`; each prints the commands it ran, their output and an `ok` or `FAIL` line per claim.

| Feature | How it is driven | What proves it |
|---|---|---|
| `build` | `npm run build`, then the bundle answers `commands` | Both bundles exist and the module runs from the single file. |
| `selfcheck` | The built module's `selfcheck` | The envelope has `"ok":true`. |
| `greet-and-list` | `verify/checks/greet-and-list.mjs` writes twice, reads, sends a bad input | Stored rows come back in order; bad input exits 1 with `E_INPUT_SCHEMA`; the same read prints the same bytes. |
| `contract` | `npm run contract` on the built module | All six contract checks print `ok`. |
| `contract-python` | Builds the Python example and runs both test suites on both binaries | Three `contract: ok` lines. |
| `install` | `verify/checks/install.mjs` installs from a release directory, twice, then offers a damaged file | The link runs the module; the second install is `unchanged`; the damaged file is refused and the link is untouched. |
| `sync` | The sync tests install fixture modules from a mirror directory, then remove a binary, alter one, remove a link, move a pin and offer a swapped file | Each module reports `installed`, `reinstalled`, `upgraded` or `unchanged` as expected; a file that does not match its pin is refused and the working version stays linked. |
| `comment-ban` | Copies the example, adds `// note`, runs ESLint | ESLint fails with the message that says what to do instead. |
| `import-rule` | Copies the example, imports `node:sqlite` in `src/domain`, runs dependency-cruiser | It fails with the message that says where the code belongs. |
| `adopt` | Builds the release files, creates a repository from the template, installs the tarballs with npm and runs that repository's own checks | Typecheck, lint, dependency rules, tests, build and contract all pass there, and both rule breaks are caught there too. |
| `standalone` | `node scripts/check-standalone.mjs` | `standalone check: ok`. |
| `models` | `npm run tlc` | Every model passes and every broken variant breaks its listed invariant. |

When you add or change something a module author or a bot can observe, add or change its row here and its entry in `features.json` in the same pull request. If a check cannot pass because a precondition is missing, leave it failing and say why; do not weaken the check.

## Evidence

Paste the table `node verify/run` prints. The complete output of every check is written to a temporary evidence directory, one `<feature id>.log` per feature, and the path is printed on the line that starts `Full output of every check:`. A proof counts when it comes from the built binary or the packed tarball, not from calling an internal function, and when it shows the result as well as the action: the exit code, the envelope, the file on disk.

## Cleanup

`verify/run` removes every temporary `AMBITIOUS_HOME` it created, and each script in `verify/checks/` removes its own scratch directories, also after a failure. The evidence directory is kept; delete it yourself when you no longer need it. Nothing is started that outlives the run, so there is nothing to stop.
