import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { envelope, envelopeProblems, exitCodeOf, serialize } from "../src/domain/envelope.ts";

const examples = join(import.meta.dirname, "..", "..", "..", "examples", "envelopes");
const identity = { schemaVersion: 1, module: "tasks", command: "next", meta: { now: "2026-01-01T00:00:00.000Z", seed: 7, version: "0.1.0" } };

const exampleFiles = (kind: string): readonly (readonly [string, unknown])[] =>
  readdirSync(join(examples, kind)).map((file) => {
    const parsed: unknown = JSON.parse(readFileSync(join(examples, kind, file), "utf8"));
    return [file, parsed];
  });

test("every valid example envelope in the contract is accepted", () => {
  for (const [file, example] of exampleFiles("valid")) assert.deepEqual(envelopeProblems(example), [], file);
});

test("every invalid example envelope in the contract is refused with a reason", () => {
  const invalid = exampleFiles("invalid");
  assert.ok(invalid.length >= 8);
  for (const [file, example] of invalid) assert.notDeepEqual(envelopeProblems(example), [], file);
});

test("an ok envelope has the seven fields in contract order, no errors, and exit code 0", () => {
  const result = envelope.ok(identity, { task: "T-12" });
  assert.equal(
    serialize(result),
    '{"ok":true,"schemaVersion":1,"module":"tasks","command":"next","data":{"task":"T-12"},"errors":[],"meta":{"now":"2026-01-01T00:00:00.000Z","seed":7,"version":"0.1.0"}}\n',
  );
  assert.deepEqual(envelopeProblems(result), []);
  assert.equal(exitCodeOf(result), 0);
});

test("a caller error exits 1 and an internal error exits 2, also when mixed", () => {
  const cycle = { code: "E_CYCLE", message: "T-12 depends on itself.", hint: "Choose another task." } as const;
  const db = { code: "E_DB", message: "The database could not be read.", hint: "Run selfcheck." } as const;
  assert.equal(exitCodeOf(envelope.err(identity, [cycle])), 1);
  assert.equal(exitCodeOf(envelope.err(identity, [db])), 2);
  assert.equal(exitCodeOf(envelope.err(identity, [cycle, db])), 2);
  assert.equal(exitCodeOf(envelope.err(identity, [{ ...db, code: "E_MIGRATION" }])), 2);
  assert.equal(exitCodeOf(envelope.err(identity, [{ ...db, code: "E_INTERNAL" }])), 2);
  assert.deepEqual(envelope.err(identity, [cycle], { cycle: ["T-12"] }).data, { cycle: ["T-12"] });
  assert.deepEqual(envelopeProblems(envelope.err(identity, [cycle])), []);
});
