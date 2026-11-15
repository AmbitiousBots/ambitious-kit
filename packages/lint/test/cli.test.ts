import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { cleanRepo } from "./lint.ts";

const eslintBin = join(import.meta.dirname, "..", "..", "..", "node_modules", ".bin", "eslint");

const runEslint = (cwd: string): { readonly exitCode: number | null; readonly output: string } => {
  const result = spawnSync(process.execPath, [eslintBin, "."], { cwd, encoding: "utf8" });
  return { exitCode: result.status, output: `${result.stdout}${result.stderr}` };
};

test("eslint passes on a repo that follows the rules", () => {
  const run = runEslint(cleanRepo);
  assert.equal(run.exitCode, 0, run.output);
  assert.equal(run.output, "");
});

test("adding // note to a file fails eslint with the fix message", (t) => {
  const repo = mkdtempSync(join(import.meta.dirname, ".tmp-"));
  t.after(() => rmSync(repo, { recursive: true }));
  cpSync(cleanRepo, repo, { recursive: true });
  appendFileSync(join(repo, "src", "domain", "greeting.ts"), "// note\n");

  const run = runEslint(repo);
  assert.equal(run.exitCode, 1, run.output);
  assert.match(run.output, /src\/domain\/greeting\.ts/);
  assert.ok(
    run.output.includes(
      "Delete the comment. Encode the rule in a type, name or test; if it is a non-obvious why, use // WHY: (budget 9 left)",
    ),
    run.output,
  );
  assert.match(run.output, /1 problem \(1 error, 0 warnings\)/);
});
