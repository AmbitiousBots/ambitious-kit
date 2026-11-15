import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Failure } from "../src/domain/failure.ts";
import { AGENT_DATA_ROOT, ambitiousHome, refuseAgentData } from "../src/paths/refuse-agent-data.ts";

const scratch = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-kit-paths-"));
  t.after(() => rmSync(directory, { recursive: true }));
  return directory;
};

const refusedCode = (path: string): string | null => {
  try {
    refuseAgentData(path);
    return null;
  } catch (error) {
    return error instanceof Failure ? error.errors[0].code : "not a Failure";
  }
};

test("a path under the bot's private data directory is refused, however it is spelled", () => {
  for (const path of [
    AGENT_DATA_ROOT,
    `${AGENT_DATA_ROOT}/`,
    `${AGENT_DATA_ROOT}/tasks.sqlite`,
    `${AGENT_DATA_ROOT}/deep/er/tasks.sqlite`,
    `${AGENT_DATA_ROOT}/../agent-data/tasks.sqlite`,
    `${AGENT_DATA_ROOT.replace("/agent-data", "/./agent-data/")}/tasks.sqlite`,
    `/tmp/../home/box/agent-data/x`,
  ]) {
    assert.equal(refusedCode(path), "E_FORBIDDEN_PATH", path);
  }
});

test("a symbolic link that leads into the private data directory is refused, also through a second link", (t) => {
  const directory = scratch(t);
  symlinkSync(AGENT_DATA_ROOT, join(directory, "direct"));
  symlinkSync(join(directory, "direct"), join(directory, "indirect"));
  symlinkSync("direct/deeper", join(directory, "relative"));
  for (const path of ["direct", "direct/tasks.sqlite", "indirect/tasks.sqlite", "relative/tasks.sqlite"]) {
    assert.equal(refusedCode(join(directory, path)), "E_FORBIDDEN_PATH", path);
  }
});

test("other paths are allowed and come back absolute, and nothing is created", (t) => {
  const directory = scratch(t);
  mkdirSync(join(directory, "real"));
  symlinkSync(join(directory, "real"), join(directory, "link"));
  assert.equal(refuseAgentData(join(directory, "missing", "tasks.sqlite")), join(directory, "missing", "tasks.sqlite"));
  assert.equal(refuseAgentData(join(directory, "link", "tasks.sqlite")), join(directory, "link", "tasks.sqlite"));
  assert.equal(refusedCode(`${AGENT_DATA_ROOT}-backup/x`), null);
  assert.equal(refusedCode(join(AGENT_DATA_ROOT, "..", "other")), null);
  assert.deepEqual(readdirSync(directory).sort(), ["link", "real"]);
});

test("AMBITIOUS_HOME defaults to /workspace/ambitious and is itself checked", () => {
  assert.equal(ambitiousHome({}), "/workspace/ambitious");
  assert.equal(ambitiousHome({ AMBITIOUS_HOME: "" }), "/workspace/ambitious");
  assert.equal(ambitiousHome({ AMBITIOUS_HOME: "/tmp/demo" }), "/tmp/demo");
  assert.throws(() => ambitiousHome({ AMBITIOUS_HOME: `${AGENT_DATA_ROOT}/home` }), Failure);
});
