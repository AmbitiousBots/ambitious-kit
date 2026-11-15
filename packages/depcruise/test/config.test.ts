import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const depcruiseBin = join(import.meta.dirname, "..", "..", "..", "node_modules", ".bin", "depcruise");

type Run = { readonly exitCode: number | null; readonly output: string };

const cruise = (fixture: string, outputType: "err" | "err-long"): Run => {
  const result = spawnSync(process.execPath, [depcruiseBin, "src", "--output-type", outputType], {
    cwd: join(import.meta.dirname, "fixtures", fixture),
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}`.replaceAll(/\s+/g, " ") };
};

type Violation = {
  readonly fixture: string;
  readonly headline: string;
  readonly fix: string;
};

const violations: readonly Violation[] = [
  {
    fixture: "domain-imports-sqlite",
    headline: "error only src/db may import node:sqlite: src/domain/rank.ts → node:sqlite",
    fix: "Move the query into src/db and export a function that returns plain data.",
  },
  {
    fixture: "domain-imports-sqlite",
    headline: "error src/domain may not import node:* modules: src/domain/rank.ts → node:sqlite",
    fix: "Move the call into src/db (SQLite), src/ai (network) or src/cli (clock, files, process)",
  },
  {
    fixture: "domain-imports-node",
    headline: "error src/domain may not import node:* modules: src/domain/rank.ts → fs",
    fix: "pass its result into src/domain as data.",
  },
  {
    fixture: "domain-imports-db",
    headline: "error src/domain may not import src/db, src/cli, src/ai or src/install: src/domain/rank.ts → src/db/store.ts",
    fix: "Move the IO into src/db, src/ai or src/cli and pass its result into src/domain as data.",
  },
  {
    fixture: "cli-imports-sqlite",
    headline: "error only src/db may import node:sqlite: src/cli/main.ts → node:sqlite",
    fix: "node:sqlite is only allowed in src/db.",
  },
  {
    fixture: "db-imports-https",
    headline: "error only src/ai and src/install may use the network: src/db/sync.ts → https",
    fix: "Network is only allowed in src/ai/ and src/install/. Move the call into src/ai/",
  },
  {
    fixture: "cli-imports-network-package",
    headline: "error only src/ai and src/install may use the network: src/cli/main.ts → node_modules/undici/index.js",
    fix: "Network is only allowed in src/ai/ and src/install/.",
  },
  {
    fixture: "domain-imports-package-db",
    headline:
      "error src/domain may not import src/db, src/cli, src/ai or src/install: src/domain/rank.ts → node_modules/@example/helpers/src/db/store.js",
    fix: "Move the IO into src/db, src/ai or src/cli and pass its result into src/domain as data.",
  },
  {
    fixture: "unresolvable-import",
    headline: "error every import must resolve: src/cli/main.ts → @example/missing/thing",
    fix: "Install the package it names, or fix the path, so the import resolves to a file.",
  },
  {
    fixture: "cycle",
    headline: "error no import cycles: src/domain/a.ts → src/domain/b.ts → src/domain/a.ts",
    fix: "Move what both sides need into a file that imports neither",
  },
];

test("a repo that follows the directory boundaries passes", () => {
  const run = cruise("clean", "err");
  assert.equal(run.exitCode, 0, run.output);
  assert.match(run.output, /no dependency violations found \(9 modules, 10 dependencies cruised\)/);
});

for (const { fixture, headline, fix } of violations) {
  test(`${fixture}: ${headline}`, () => {
    const short = cruise(fixture, "err");
    assert.notEqual(short.exitCode, 0);
    assert.ok(short.output.includes(headline), short.output);

    const long = cruise(fixture, "err-long");
    assert.notEqual(long.exitCode, 0);
    assert.ok(long.output.includes(fix), long.output);
  });
}
