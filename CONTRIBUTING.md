# Contributing

Thank you for helping. This repository is the kit that every [Ambitious](https://ambitiousbots.com) module is built from: the module contract, the shared code, the lint and dependency rules, the contract tests and the files a new module repository starts with. The [README](README.md) says what is where, and [AGENTS.md](AGENTS.md) describes how the repository is laid out and how to decide what belongs in it.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## File an issue

- A bug: open an issue with the bug report form. Give the exact command, its input, everything it printed, and the versions the form asks for.
- An idea: open an issue with the feature request form before you write much code, so the approach can be agreed first. A rule belongs in the kit only when every module needs it.
- A change to the contract: read "How to propose a change" in [MODULE_CONTRACT.md](MODULE_CONTRACT.md) first. A change that breaks existing modules needs a strong reason.
- A security vulnerability: do not open an issue. Follow [SECURITY.md](SECURITY.md).

Replace real keys, passwords and personal data with made-up values in anything you post.

## Set up a checkout

You need two tools:

- [git](https://git-scm.com).
- [mise](https://mise.jdx.dev), a tool-version manager. It installs the exact Node, Python and Java versions pinned in `.mise.toml`, so you do not install those yourself. Node runs the code and the checks, Python runs the Python kit, and Java runs TLC, the TLA+ model checker.

Then, in your clone:

```text
mise trust && mise install
npm ci
```

`npm ci` installs the packages pinned in `package-lock.json`. Nothing else needs installing.

## Run the checks

One command runs every check in order, builds the release files and ends with a table. CI runs the same command on every pull request.

```text
npm run release:check
```

While you work, run the single check that covers your change; the "Checks" section of the [README](README.md#checks) lists each one and what it checks. The ones you will use most:

| Command | What it checks |
|---|---|
| `npm run typecheck` | The TypeScript types. |
| `npm run lint` | The lint rules, and that no tracked file contains an internal plan ID or a path on one person's machine. |
| `npm test` | The tests for the kit, the rules, the repo template, the example module and the checks themselves. |
| `npm run verify` | `verify/run`: every user-visible feature in `verify/features.json`, each against a fresh temporary `AMBITIOUS_HOME` (the directory a module keeps its data in). |

A check that fails means the change is not ready. Fix the cause; never weaken or skip the check.

## Things to know before you change the kit

- Everything here is copied into every module, so make the smallest change that meets the goal.
- `packages/kit` (TypeScript) and `packages/kit-python` (Python) mirror each other. A change to one is a change to both.
- A new lint or dependency rule needs a fixture that fails with the rule's message and clean code that passes.
- Files under `repo-template/` are what a new module repository starts with. Several of them must stay byte for byte the same as the kit's own copy; `npm test` tells you which when they differ.
- Code has no comments, apart from the small budget of `// SAFETY:` and `// WHY:` comments the lint rules allow. Say it with names and types instead.

## Open a pull request

1. Fork the repository, or create a branch if you have write access. Keep one purpose per pull request.
2. When behavior changes, change the tests with it, and add or update the entry in `verify/features.json` for anything a user can see.
3. Write commit messages and the pull request in plain language. Everything in this repository is public, so write nothing that only makes sense inside one organisation: no private ticket numbers, no paths on your machine, no names of people or customers.
4. Fill in every section of the pull request template: why, what changed, evidence (paste the output of the checks you ran), and the decisions you made on your own.
5. A maintainer reviews the pull request and merges it once the checks pass.

## License

This repository is licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE). As section 5 of the license says, anything you submit for inclusion is under the same license, with no additional terms.
