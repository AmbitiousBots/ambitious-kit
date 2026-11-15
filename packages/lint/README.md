# @ambitious/lint

The lint rules every Ambitious repo runs. Each message says how to fix the cause.

## Use it (TypeScript)

`eslint.config.js`:

```js
import { ambitiousLint } from "@ambitious/lint";

export default ambitiousLint({ root: import.meta.dirname });
```

Options: `root` (the repo root; the comment budget is counted under it), `ignores` (extra globs to skip) and `defaultExportFiles` (globs where a framework needs a default export). The package is TypeScript run directly by Node 24, so it is used as a workspace package, not installed from a tarball.

## Rules

| Rule | Where it is allowed |
|---|---|
| No comments. `// WHY:` and `// SAFETY:` on their own line directly above code are allowed, 10 per repo in total. | License header at the top of a file; `// @ts-expect-error <reason>` |
| No reading the clock: `Date.now`, `new Date()` with no arguments, `Date()`, `performance.now`, `process.hrtime` | `src/cli` |
| No randomness: `Math.random`, `crypto.randomUUID`, `crypto.getRandomValues` | `src/cli` |
| No timers: `setTimeout`, `setInterval`, `setImmediate`, `node:timers` | `src/cli` |
| No `console` | `src/cli` |
| No network: `fetch`, `WebSocket`, `EventSource`, `XMLHttpRequest`, `node:http`, `https`, `http2`, `net`, `tls`, `dgram`, `dns` and common HTTP packages | `src/ai`, `src/install` |
| No `any`, no non-null `!`, no `as` casts | `as const` |
| No default exports | `*.config.*` files, `.dependency-cruiser.mjs`, `defaultExportFiles` |
| No barrel files: `export *`, or a file that only re-exports | nowhere |

Inline `eslint-disable` comments are switched off, so a rule cannot be silenced from inside a file.

The comment message is: `Delete the comment. Encode the rule in a type, name or test; if it is a non-obvious why, use // WHY: (budget N left).` `N` is 10 minus the `// WHY:` and `// SAFETY:` comments in the repo. An eleventh fails every one of them.

## Python

`python/check_comments.py` is the same comment ban for Python, standard library only:

```text
python3 check_comments.py <repo-root> [--exclude DIRECTORY_NAME]
```

It fails on `#` comments, docstrings and bare string statements. It allows `# WHY:` and `# SAFETY:` above code (10 per repo), a license header, a shebang, and `# type: ignore[code]  # reason`.

`python/ruff.toml` and `python/mypy.ini` are starting configs, checked against ruff 0.17.5 and mypy 2.4.1. Ruff cannot allow one banned API in one directory, so the `cli`, `ai`, `install` and `db` packages switch the whole banned-API rule off; the bans are enforced everywhere else.

## Tests

`npm test` at the repo root. `test/rules.test.ts` has one failing and one passing case per rule.
