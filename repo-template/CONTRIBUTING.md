# Contributing

Thank you for helping. This repository is an [Ambitious](https://ambitiousbots.com) module: an open-source, single-purpose command-line tool with no user interface. A bot runs it, passes JSON in and reads JSON out. The rules every module follows are in `MODULE_CONTRACT.md` in the [ambitious-kit](https://github.com/AmbitiousBots/ambitious-kit) repository, and [AGENTS.md](AGENTS.md) describes how this repository is laid out.

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md).

## File an issue

- A bug: open an issue with the bug report form. Give the exact command, its input, everything it printed, and the versions the form asks for.
- An idea: open an issue with the feature request form before you write much code, so the approach can be agreed first.
- A security vulnerability: do not open an issue. Follow [SECURITY.md](SECURITY.md).

Replace real keys, passwords and personal data with made-up values in anything you post.

## Set up a checkout

You need two tools:

- [git](https://git-scm.com).
- [mise](https://mise.jdx.dev), a tool-version manager. It installs the exact Node, Python and Java versions pinned in `.mise.toml`, so you do not install those yourself. Node runs the code and the checks, Python is for modules written in Python, and Java runs TLC, the TLA+ model checker.

Then, in your clone:

```text
mise trust && mise install
npm install --strict-peer-deps
npm ci --strict-peer-deps
```

Run `npm install --strict-peer-deps`, then `npm ci --strict-peer-deps`. `npm ci --strict-peer-deps` reinstalls the packages pinned in `package-lock.json`. For a TypeScript module using kit 0.6.0, pin `@ambitious/typescript7` to `npm:typescript@7.0.2` and `typescript` to `npm:@typescript/typescript6@6.0.2`. Check the installed tree with `npm ls --all`. Skip installation if the repository has no lockfile yet.

## Run the checks

Run every check before you push. `package.json` lists them under `scripts`; a module has these from its first commit:

| Command | What it checks |
|---|---|
| `npm run lint` | The lint rules, and that no tracked file contains an internal plan ID or a path on one person's machine. |
| `npm run tlc` | Every TLA+ model in `spec/` passes the TLC model checker, and every deliberately broken copy in `spec/broken/` breaks the rule listed for it. |
| `npm run verify` | `verify/run`: every feature in `verify/features.json`, each against a fresh temporary `AMBITIOUS_HOME` (the directory a module keeps its data in). |

Also run `typecheck`, `depcruise`, `test`, `build` and `contract` with `npm run <name>` when `package.json` has them. A check that fails means the change is not ready. Fix the cause; never weaken or skip the check.

## Open a pull request

1. Fork the repository, or create a branch if you have write access. Keep one purpose per pull request.
2. Make the smallest change that meets the goal. When behavior changes, change the tests with it, and add or update the entry in `verify/features.json` for anything a user can see.
3. Write commit messages and the pull request in plain language. Everything in this repository is public, so write nothing that only makes sense inside one organisation: no private ticket numbers, no paths on your machine, no names of people or customers.
4. Fill in every section of the pull request template: why, what changed, evidence (paste the output of `verify/run`), and the decisions you made on your own.
5. A maintainer reviews the pull request and merges it once the checks pass.

## License

This repository is licensed under the Apache License, Version 2.0; see [LICENSE](LICENSE). As section 5 of the license says, anything you submit for inclusion is under the same license, with no additional terms.
