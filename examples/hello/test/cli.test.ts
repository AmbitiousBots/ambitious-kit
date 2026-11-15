import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { contractTests } from "@ambitious/kit/contract/contract-tests";

const binary = join(import.meta.dirname, "..", "dist", "ambitious-hello.mjs");

contractTests(binary);

type Answer = { readonly exit: number | null; readonly stdout: string };

const freshHome = (t: TestContext): string => {
  const home = mkdtempSync(join(tmpdir(), "ambitious-hello-"));
  t.after(() => rmSync(home, { recursive: true }));
  return home;
};

const hello = (home: string, args: readonly string[], input = ""): Answer => {
  const result = spawnSync(process.execPath, [binary, ...args, "--now", "2026-01-01T00:00:00Z", "--seed", "7"], {
    encoding: "utf8",
    input,
    env: { ...process.env, AMBITIOUS_HOME: home },
  });
  return { exit: result.status, stdout: result.stdout };
};

const META = '"meta":{"now":"2026-01-01T00:00:00.000Z","seed":7,"version":"0.2.0"}}\n';

test("greet stores a greeting and list shows every greeting in the order they were made", (t) => {
  const home = freshHome(t);
  assert.deepEqual(hello(home, ["greet"], '{"name":"world"}'), {
    exit: 0,
    stdout: `{"ok":true,"schemaVersion":1,"module":"hello","command":"greet","data":{"greeting":{"id":1,"name":"world","text":"Hello, world.","createdAt":"2026-01-01T00:00:00.000Z"}},"errors":[],${META}`,
  });
  assert.equal(hello(home, ["greet"], '{"name":"again"}').exit, 0);
  assert.deepEqual(hello(home, ["list"]), {
    exit: 0,
    stdout: `{"ok":true,"schemaVersion":1,"module":"hello","command":"list","data":{"greetings":[{"id":1,"name":"world","text":"Hello, world.","createdAt":"2026-01-01T00:00:00.000Z"},{"id":2,"name":"again","text":"Hello, again.","createdAt":"2026-01-01T00:00:00.000Z"}]},"errors":[],${META}`,
  });
});

test("greet without a usable name is refused with E_INPUT_SCHEMA and stores nothing", (t) => {
  const home = freshHome(t);
  assert.equal(hello(home, ["selfcheck"]).exit, 0);
  const refused = hello(home, ["greet"], '{"name":""}');
  assert.equal(refused.exit, 1);
  assert.match(refused.stdout, /"code":"E_INPUT_SCHEMA"/);
  assert.match(hello(home, ["list"]).stdout, /"greetings":\[\]/);
});
