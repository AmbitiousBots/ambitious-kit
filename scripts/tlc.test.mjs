import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

const kitRoot = join(import.meta.dirname, "..");
const script = join(import.meta.dirname, "tlc.mjs");

const CONFIG = "SPECIFICATION Spec\nCONSTANT Capacity = 3\nINVARIANT WithinCapacity\n";
const GUARD = "    /\\ used < Capacity\n";
const guarded = readFileSync(join(kitRoot, "spec", "Sample.tla"), "utf8");
const named = (text, name) => text.replace("MODULE Sample ", `MODULE ${name} `);
const unguarded = (name) => named(guarded.replace(GUARD, ""), name);
const expecting = (entries) => `${JSON.stringify(entries)}\n`;
const BREAKS_CAPACITY = { invariant: "WithinCapacity", because: "Add no longer checks that there is room." };

const sound = {
  "Sample.tla": guarded,
  "Sample.cfg": CONFIG,
  "broken/SampleNoGuard.tla": unguarded("SampleNoGuard"),
  "broken/SampleNoGuard.cfg": CONFIG,
  "broken/EXPECTED.json": expecting({ SampleNoGuard: BREAKS_CAPACITY }),
};

const tlc = (t, files) => {
  const directory = mkdtempSync(join(tmpdir(), "tlc-test-"));
  t.after(() => rmSync(directory, { recursive: true }));
  const spec = join(directory, "spec");
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(spec, name)), { recursive: true });
    writeFileSync(join(spec, name), content);
  }
  const result = spawnSync(process.execPath, [script, "spec"], { cwd: directory, encoding: "utf8" });
  const leftBehind = readdirSync(spec, { recursive: true }).filter((name) => /TTrace|states/.test(name));
  assert.deepEqual(leftBehind, [], "TLC must not write into the spec directory");
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const row = (stdout, model) => stdout.split("\n").find((line) => line.startsWith(`${model} `));

test("the guard in the sample model is the text the tests remove", () => {
  assert.ok(guarded.includes(GUARD));
});

test("a model that passes and a broken variant that breaks its listed invariant are both ok", (t) => {
  const run = tlc(t, sound);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.match(row(run.stdout, "spec/Sample"), /pass +found no error in 4 states +ok$/);
  assert.match(row(run.stdout, "spec/broken/SampleNoGuard"), /break WithinCapacity +broke WithinCapacity +ok$/);
  assert.match(run.stdout, /tlc: ok\. 2 of 2 models behaved as required\.\n$/);
});

test("a broken variant that passes is a failure", (t) => {
  const run = tlc(t, { ...sound, "broken/SampleNoGuard.tla": named(guarded, "SampleNoGuard") });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(row(run.stdout, "spec/broken/SampleNoGuard"), /break WithinCapacity +found no error in 4 states +FAIL$/);
  assert.match(row(run.stdout, "spec/Sample"), /ok$/);
  assert.ok(run.stdout.includes("FAIL: spec/broken/SampleNoGuard must break WithinCapacity but passed."), run.stdout);
  assert.match(run.stdout, /tlc: 1 of 2 rows failed\.\n$/);
});

test("a broken variant that breaks a different invariant is a failure", (t) => {
  const run = tlc(t, {
    ...sound,
    "broken/SampleNoGuard.tla": unguarded("SampleNoGuard").replace(
      "WithinCapacity ==",
      "AtMostOne == used <= 1\n\nWithinCapacity ==",
    ),
    "broken/SampleNoGuard.cfg": CONFIG.replace("INVARIANT WithinCapacity", "INVARIANT AtMostOne WithinCapacity"),
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(row(run.stdout, "spec/broken/SampleNoGuard"), /break WithinCapacity +broke AtMostOne +FAIL$/);
  assert.ok(run.stdout.includes("must break WithinCapacity but broke AtMostOne first."), run.stdout);
});

test("a broken variant that cannot be read is a failure, not an expected failure", (t) => {
  const run = tlc(t, { ...sound, "broken/SampleNoGuard.tla": unguarded("SampleNoGuard").replace("Init ==", "Init == ==") });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(row(run.stdout, "spec/broken/SampleNoGuard"), /break WithinCapacity +could not be read: .* +FAIL$/);
  assert.ok(run.stdout.includes("TLC output for spec/broken/SampleNoGuard:"), run.stdout);
  assert.ok(run.stdout.includes("TLC could not check it"), run.stdout);
});

test("a model that breaks its invariant is a failure and its trace is printed", (t) => {
  const run = tlc(t, { ...sound, "Sample.tla": unguarded("Sample") });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.match(row(run.stdout, "spec/Sample"), /pass +broke WithinCapacity +FAIL$/);
  assert.ok(run.stdout.includes("TLC output for spec/Sample:"), run.stdout);
  assert.ok(run.stdout.includes("Error: Invariant WithinCapacity is violated."), run.stdout);
  assert.ok(run.stdout.includes("used = 4"), run.stdout);
});

test("a broken variant with no listed invariant is a failure", (t) => {
  const run = tlc(t, { ...sound, "broken/EXPECTED.json": expecting({}) });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(
    run.stdout.includes('FAIL: Add "SampleNoGuard" to spec/broken/EXPECTED.json with the invariant it must break and why.'),
    run.stdout,
  );
});

test("a listed variant that does not exist is a failure", (t) => {
  const run = tlc(t, {
    ...sound,
    "broken/EXPECTED.json": expecting({ SampleNoGuard: BREAKS_CAPACITY, Gone: BREAKS_CAPACITY }),
  });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.stdout.includes('FAIL: Remove "Gone" from spec/broken/EXPECTED.json'), run.stdout);
  assert.match(row(run.stdout, "spec/broken/SampleNoGuard"), /ok$/);
});

test("an entry without a reason is a failure", (t) => {
  const run = tlc(t, { ...sound, "broken/EXPECTED.json": expecting({ SampleNoGuard: { invariant: "WithinCapacity" } }) });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.stdout.includes('Entry "SampleNoGuard" needs an "invariant" and a "because".'), run.stdout);
});

test("models with no broken variant are a failure", (t) => {
  const run = tlc(t, { "Sample.tla": guarded, "Sample.cfg": CONFIG });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.stdout.includes("FAIL: Add a broken variant to spec/broken"), run.stdout);
  assert.match(row(run.stdout, "spec/Sample"), /ok$/);
});

test("a spec directory with no models is a failure", (t) => {
  const run = tlc(t, { "README.md": "No models yet.\n" });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.stdout.includes("FAIL: Add a model to spec"), run.stdout);
});

test("a configuration without its model is a failure", (t) => {
  const run = tlc(t, { ...sound, "Other.cfg": CONFIG });
  assert.equal(run.status, 1, run.stdout + run.stderr);
  assert.ok(run.stdout.includes("FAIL: Add spec/Other.tla: every .cfg needs the model it configures."), run.stdout);
});

test("the kit's own models behave as required", () => {
  const result = spawnSync(process.execPath, [script], { cwd: kitRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /tlc: ok\. 2 of 2 models behaved as required\.\n$/);
});

test("an unknown option is refused", () => {
  const result = spawnSync(process.execPath, [script, "--fast"], { cwd: kitRoot, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Unexpected arguments "--fast"/);
});
