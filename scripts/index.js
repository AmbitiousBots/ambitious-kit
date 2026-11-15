// WHY: `node --test scripts/` runs the directory as one module, which resolves to this file; it loads every test beside it.
import { readdirSync } from "node:fs";

const tests = readdirSync(import.meta.dirname)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort();

for (const name of tests) {
  await import(`./${name}`);
}
