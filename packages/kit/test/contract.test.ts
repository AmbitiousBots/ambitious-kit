import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";
import { runContract } from "../src/contract/checks.ts";
import { contractTests } from "../src/contract/contract-tests.ts";
import { isRecord } from "../src/domain/json.ts";

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
  ["extra-envelope-field", "envelope-shape", ["exit-codes", "now-determinism", "agent-data-refusal", "read-only-analysis", "no-stdout-noise", "listed-shapes"]],
  ["always-exit-zero", "exit-codes", ["agent-data-refusal", "read-only-analysis", "no-stdout-noise", "listed-shapes"]],
  ["reads-the-clock", "now-determinism", ["envelope-shape", "exit-codes"]],
  ["allows-agent-data", "agent-data-refusal", []],
  ["read-command-migrates", "read-only-analysis", ["agent-data-refusal"]],
  ["stdout-noise", "no-stdout-noise", ["envelope-shape", "exit-codes", "now-determinism", "agent-data-refusal", "listed-shapes"]],
  ["refuses-help", "envelope-shape", []],
  ["help-runs-the-command", "envelope-shape", []],
  ["help-lists-every-command", "envelope-shape", []],
  ["example-is-refused", "listed-shapes", []],
  ["required-field-is-optional", "listed-shapes", []],
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

const problemsOf = (binary: string, id: string): readonly string[] => runContract(binary).find((result) => result.id === id)?.problems ?? [];

test("the example module lists the shape of greet, so the listed-shapes check has an example and a required field to send", () => {
  const listed = spawnSync(process.execPath, [hello, "commands"], { encoding: "utf8", env: { ...process.env, AMBITIOUS_HOME: join(root, "does-not-exist") } });
  const parsed: unknown = JSON.parse(listed.stdout);
  const commands = isRecord(parsed) && isRecord(parsed.data) && Array.isArray(parsed.data.commands) ? parsed.data.commands : [];
  assert.deepEqual(
    commands.find((entry: unknown) => isRecord(entry) && entry.name === "greet"),
    { name: "greet", access: "write", input: true, fields: [{ name: "name", type: "string", required: true }], example: { name: "world" } },
  );
});

test("each shape and help failure says what is wrong in words a module author can act on", () => {
  assert.deepEqual(problemsOf(broken("example-is-refused"), "listed-shapes"), [
    '`commands`: the command "greet" lists an example that is refused with E_INPUT_SCHEMA. The example is sent as input, so it must be valid input.',
  ]);
  assert.deepEqual(problemsOf(broken("required-field-is-optional"), "listed-shapes"), [
    '`commands`: the command "greet" lists the field "name" as required, so the example without it must fail with E_INPUT_SCHEMA, but it answered ok.',
  ]);
  assert.deepEqual(problemsOf(broken("refuses-help"), "envelope-shape"), [
    "`--help --now 2026-01-01T00:00:00Z --seed 7`: must succeed, but failed with E_USAGE, E_USAGE.",
    "`selfcheck --help --now 2026-01-01T00:00:00Z --seed 7`: must succeed, but failed with E_USAGE.",
  ]);
  assert.deepEqual(problemsOf(broken("help-lists-every-command"), "envelope-shape"), [
    "`selfcheck --help --now 2026-01-01T00:00:00Z --seed 7`: --help with a command name must answer with command set to that name and data.commands holding that one command's entry exactly as `commands` lists it.",
  ]);
  assert.match(problemsOf(broken("help-runs-the-command"), "envelope-shape").join("\n"), /^`selfcheck --help [^`]*`: --help must describe the command and not run it, but AMBITIOUS_HOME now holds hello/);
});
