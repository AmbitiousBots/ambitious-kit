import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = join(import.meta.dirname, "release-build.mjs");
const build = (output) => spawnSync(process.execPath, [script, output], { encoding: "utf8" });

const scratch = (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-release-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

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
