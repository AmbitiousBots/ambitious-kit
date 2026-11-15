import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { runContract } from "../src/contract/checks.ts";
import { contractTests } from "../src/contract/contract-tests.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const hello = join(root, "examples", "hello", "dist", "ambitious-hello.mjs");
const broken = (name: string): string => join(import.meta.dirname, "fixtures", "broken", `${name}.mjs`);

process.env.AMBITIOUS_REAL_BINARY = hello;

contractTests(hello);

const failing = (binary: string): readonly string[] =>
  runContract(binary)
    .filter(({ problems }) => problems.length > 0)
    .map(({ id }) => id);

test("a wrapper that passes everything through unchanged passes, so the broken ones below fail for their one change", () => {
  assert.deepEqual(failing(broken("faithful")), []);
});

const BROKEN: readonly (readonly [name: string, mustCatch: string, alsoFails: readonly string[]])[] = [
  ["extra-envelope-field", "envelope-shape", ["exit-codes", "now-determinism", "agent-data-refusal", "read-only-analysis", "no-stdout-noise"]],
  ["always-exit-zero", "exit-codes", ["agent-data-refusal", "read-only-analysis", "no-stdout-noise"]],
  ["reads-the-clock", "now-determinism", ["envelope-shape", "exit-codes"]],
  ["allows-agent-data", "agent-data-refusal", []],
  ["read-command-migrates", "read-only-analysis", ["agent-data-refusal"]],
  ["stdout-noise", "no-stdout-noise", ["envelope-shape", "exit-codes", "now-determinism", "agent-data-refusal"]],
];

for (const [name, mustCatch, alsoFails] of BROKEN) {
  test(`a binary that ${name.replaceAll("-", " ")} fails the ${mustCatch} check`, () => {
    assert.deepEqual([...failing(broken(name))].sort(), [mustCatch, ...alsoFails].sort());
  });
}

test("a binary that does not exist is reported, not skipped", () => {
  const [result] = runContract(join(root, "examples", "hello", "dist", "missing.mjs"));
  assert.match(result?.problems[0] ?? "", /does not exist. Build the module first\./);
});
