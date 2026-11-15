import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test, type TestContext } from "node:test";

const kitRoot = join(import.meta.dirname, "..");
const templateDir = join(kitRoot, "repo-template");
const script = join(kitRoot, "scripts", "apply-template.mjs");

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();

const templateFiles = filesUnder(templateDir);

const emptyDir = (t: TestContext): string => {
  const dir = mkdtempSync(join(tmpdir(), "ambitious-apply-template-"));
  t.after(() => rmSync(dir, { recursive: true }));
  return dir;
};

type Run = { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string };

const apply = (...args: readonly string[]): Run => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};

const read = (dir: string, file: string): string => readFileSync(join(dir, file), "utf8");

test("the template holds every file a module repo starts with", () => {
  assert.deepEqual(templateFiles, [
    ".cursor/rules/agent-models.mdc",
    ".github/pull_request_template.md",
    "AGENTS.md",
    "CLAUDE.md",
    "LICENSE",
    "NOTICE",
    "spec/README.md",
    "src/ai/README.md",
    "src/cli/README.md",
    "src/db/README.md",
    "src/domain/README.md",
    "test/README.md",
    "verify/README.md",
  ]);
  assert.ok(read(templateDir, "AGENTS.md").split("\n").length <= 60);
  assert.equal(read(templateDir, "CLAUDE.md"), "See AGENTS.md\n");
  assert.equal(read(templateDir, "LICENSE"), read(kitRoot, "LICENSE"));
  assert.match(read(templateDir, ".cursor/rules/agent-models.mdc"), /^# budget: large \(xhigh\)$/m);
  for (const heading of ["## Why", "## What changed", "## Evidence"]) {
    assert.ok(read(templateDir, ".github/pull_request_template.md").includes(heading));
  }
});

test("applying to an empty repo creates every template file and says so", (t) => {
  const target = emptyDir(t);
  const run = apply(target);

  assert.equal(run.exitCode, 0, run.stderr);
  assert.deepEqual(filesUnder(target), templateFiles);
  for (const file of templateFiles) {
    assert.equal(read(target, file), read(templateDir, file));
    assert.ok(run.stdout.includes(`created  ${file}\n`), run.stdout);
  }
  assert.match(run.stdout, /13 created, 0 kept/);
});

test("applying twice changes nothing the second time", (t) => {
  const target = emptyDir(t);
  apply(target);
  const before = templateFiles.map((file) => read(target, file));
  const run = apply(target);

  assert.equal(run.exitCode, 0, run.stderr);
  assert.deepEqual(templateFiles.map((file) => read(target, file)), before);
  assert.deepEqual(filesUnder(target), templateFiles);
  assert.match(run.stdout, /0 created, 13 kept/);
});

test("a file the repo already has is kept as it is", (t) => {
  const target = emptyDir(t);
  writeFileSync(join(target, "AGENTS.md"), "This repo's own guide.\n");
  mkdirSync(join(target, "src", "domain"), { recursive: true });
  writeFileSync(join(target, "src", "domain", "README.md"), "Already here.\n");
  const run = apply(target);

  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(read(target, "AGENTS.md"), "This repo's own guide.\n");
  assert.equal(read(target, "src/domain/README.md"), "Already here.\n");
  assert.ok(run.stdout.includes("kept  AGENTS.md\n"), run.stdout);
  assert.ok(run.stdout.includes("kept  src/domain/README.md\n"), run.stdout);
  assert.match(run.stdout, /11 created, 2 kept/);
});

test("a dry run lists what it would create and writes nothing", (t) => {
  const target = emptyDir(t);
  const run = apply(target, "--dry-run");

  assert.equal(run.exitCode, 0, run.stderr);
  assert.deepEqual(filesUnder(target), []);
  assert.ok(run.stdout.includes("would create  AGENTS.md\n"), run.stdout);
  assert.match(run.stdout, /13 to create, 0 kept/);
});

test("a target that is not a directory is refused", (t) => {
  const missing = join(emptyDir(t), "missing");
  const run = apply(missing);

  assert.equal(run.exitCode, 1);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /is not a directory/);
  assert.equal(apply().exitCode, 1);
});

test("a symbolic link that leads outside the target is refused and nothing is written", (t) => {
  const target = emptyDir(t);
  const outside = emptyDir(t);
  symlinkSync(outside, join(target, "src"));
  const run = apply(target);

  assert.equal(run.exitCode, 1);
  assert.match(run.stderr, /Nothing was written/);
  assert.match(run.stderr, /src\/domain\/README\.md/);
  assert.deepEqual(filesUnder(outside), []);
  assert.deepEqual(filesUnder(target), []);
});

test("the kit repo itself has every template file", () => {
  const run = apply(kitRoot, "--dry-run");

  assert.equal(run.exitCode, 0, run.stderr);
  assert.match(run.stdout, /0 to create, 13 kept/);
});
