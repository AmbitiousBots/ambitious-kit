# @ambitious/depcruise

The dependency rules every Ambitious repo runs, as one dependency-cruiser config.

## Use it

`.dependency-cruiser.mjs`:

```js
import { config } from "@ambitious/depcruise";

export default config;
```

Then `npx depcruise src`. Add `--output-type err-long` to print how to fix each violation.

## Rules

| Rule | Fix |
|---|---|
| `src/domain` may not import `src/db`, `src/cli`, `src/ai` or `src/install` | Move the IO into `src/db`, `src/ai` or `src/cli` and pass its result in as data. |
| `src/domain` may not import `node:*` modules | Same. |
| Only `src/db` may import `node:sqlite` | Move the query into `src/db` and return plain data. |
| Only `src/ai` and `src/install` may use the network | Move the call into `src/ai` and pass its result in as data. |
| Every import must resolve | Install the package it names, or fix the path. An import that cannot be found would slip past every other rule. |
| No import cycles | Move what both sides need into a file that imports neither. |

Type-only imports count. The rules match any `src/` directory, so they also hold inside workspace packages and for imports from an installed package that keeps the same layout, such as `@ambitious/kit`: `src/domain` may not import `@ambitious/kit/db/open-db`.

## Tests

`npm test` at the repo root. Each directory under `test/fixtures` is a small repo that breaks one rule; `clean` breaks none.
