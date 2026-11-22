import { createRequire } from "node:module";
import { getAvailableTranspilers } from "dependency-cruiser";

const expected = "6.0.3";
const lint = createRequire(import.meta.resolve("@ambitious/lint"));
const parser = createRequire(lint.resolve("@typescript-eslint/parser"));
const cruiser = getAvailableTranspilers().find(({ name }) => name === "typescript");

for (const [tool, version] of [
  ["@typescript-eslint/parser", parser("typescript").version],
  ["dependency-cruiser", cruiser?.currentVersion?.replace(/^typescript@/u, "")],
]) {
  if (version !== expected) {
    process.stderr.write(`${tool} loaded TypeScript API ${version}. Install the README aliases for API ${expected}.\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${tool} loaded TypeScript API ${version}.\n`);
  }
}
