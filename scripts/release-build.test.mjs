import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { TEMPLATE_BUDGET, templateBudgetFailure } from "../packages/kit/scripts/template-budget.mjs";

const script = join(import.meta.dirname, "release-build.mjs");
const repoRoot = join(import.meta.dirname, "..");
const build = (output, buildScript = script) => spawnSync(process.execPath, [buildScript, output], { encoding: "utf8" });

const scratch = (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-release-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

const templateCheckout = (t) => {
  const repo = scratch(t);
  for (const path of ["package.json", "scripts/release-build.mjs", "scripts/template-generate.mjs", "packages/kit/package.json", "packages/kit/scripts", "packages/kit/src", "template"]) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    cpSync(join(repoRoot, path), join(repo, path), { recursive: true, filter: (source) => source !== join(repoRoot, "template", "test") });
  }
  symlinkSync(join(repoRoot, "node_modules"), join(repo, "node_modules"), "dir");
  const generated = spawnSync(process.execPath, [join(repo, "scripts", "template-generate.mjs")], { encoding: "utf8" });
  assert.equal(generated.status, 0, `${generated.stdout}\n${generated.stderr}`);
  return repo;
};

test("the release build refuses a stale oversized packaged bot and an in-budget stale bot before touching release output", (t) => {
  const repo = templateCheckout(t);
  const botFile = join(repo, "template", "bot.json");
  const current = readFileSync(botFile, "utf8");
  const bot = JSON.parse(current);
  assert.equal(templateBudgetFailure(bot.skills, bot.routines), null, "the generated source template fits the budget");
  const output = join(repo, "release");
  mkdirSync(output);
  writeFileSync(join(output, "SHA256SUMS"), "earlier checksums");
  writeFileSync(join(output, "ambitious-template-0.0.1.tgz"), "earlier template");
  const buildScript = join(repo, "scripts", "release-build.mjs");
  for (const [change, failure] of [
    [(payload) => { payload.skills[0].body += "x".repeat(TEMPLATE_BUDGET.totalBytes); }, /template size budget exceeded/u],
    [(payload) => { payload.name = "stale template"; }, /template: out of date/u],
  ]) {
    const stale = JSON.parse(current);
    change(stale);
    const staleText = `${JSON.stringify(stale, null, 2)}\n`;
    writeFileSync(botFile, staleText);
    for (const destination of [output, join(repo, "new-release")]) {
      const result = build(destination, buildScript);
      assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
      assert.match(`${result.stdout}\n${result.stderr}`, failure);
      assert.deepEqual(readdirSync(output).sort(), ["SHA256SUMS", "ambitious-template-0.0.1.tgz"]);
      assert.equal(readFileSync(join(output, "SHA256SUMS"), "utf8"), "earlier checksums");
      assert.equal(readFileSync(join(output, "ambitious-template-0.0.1.tgz"), "utf8"), "earlier template");
      assert.equal(existsSync(join(repo, "new-release")), false);
      assert.equal(readFileSync(botFile, "utf8"), staleText, "release validation must not regenerate the packaged file");
    }
  }
});

test("the release build refuses an output directory that holds anything but an earlier release, and deletes nothing", (t) => {
  const output = scratch(t);
  writeFileSync(join(output, "my-notes.txt"), "keep me");
  writeFileSync(join(output, "SHA256SUMS"), "from an earlier build");
  mkdirSync(join(output, "ambitious-kit-0.0.1.tgz"));
  const result = build(output);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /my-notes\.txt/);
  assert.match(result.stderr, /Nothing was deleted/);
  assert.deepEqual(readdirSync(output).sort(), ["SHA256SUMS", "ambitious-kit-0.0.1.tgz", "my-notes.txt"]);
  assert.equal(readFileSync(join(output, "my-notes.txt"), "utf8"), "keep me");
  assert.equal(readFileSync(join(output, "SHA256SUMS"), "utf8"), "from an earlier build");
});

test("the release build refuses an output path that is a file", (t) => {
  const file = join(scratch(t), "notes.txt");
  writeFileSync(file, "keep me");
  const result = build(file);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not a directory/);
  assert.equal(readFileSync(file, "utf8"), "keep me");
});
