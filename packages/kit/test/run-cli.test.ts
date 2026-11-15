import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { pureCommand, readCommand, writeCommand } from "../src/cli/command.ts";
import { cliEnvelope, type Io, type ModuleSpec } from "../src/cli/run-cli.ts";
import { envelopeProblems, exitCodeOf, type Envelope } from "../src/domain/envelope.ts";
import { failure } from "../src/domain/failure.ts";
import { isRecord } from "../src/domain/json.ts";

const NOW = "2026-01-01T00:00:00Z";

const parseNote = (raw: unknown): { readonly body: string } => {
  const body = isRecord(raw) ? raw.body : undefined;
  if (typeof body !== "string") throw failure("E_INPUT_SCHEMA", 'The input field "body" must be a string.', 'Send { "body": "..." }.');
  return { body };
};

const spec: ModuleSpec = {
  module: "notes",
  version: "0.1.0",
  schemaVersion: 1,
  migrations: [{ name: "0001_create_notes", sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, at TEXT NOT NULL);" }],
  commands: {
    add: writeCommand({
      input: parseNote,
      run: ({ input, db, clock }) => {
        db.prepare("INSERT INTO notes (body, at) VALUES (?, ?)").run(input.body, clock.now().toISOString());
        if (input.body === "refuse me") throw failure("E_REFUSED", "This note is refused.", "Send another body.", { body: input.body });
        if (input.body === "crash") throw new TypeError("a bug in the module");
        return { added: input.body };
      },
    }),
    count: readCommand({ run: ({ db }) => ({ count: Number(db.prepare("SELECT count(*) AS count FROM notes").get()?.count) }) }),
    "count sneaky": readCommand({
      run: ({ db }) => {
        db.exec("DELETE FROM notes");
        return {};
      },
    }),
    "dice roll": pureCommand({ run: ({ rng, clock }) => ({ roll: rng.int(6) + 1, at: clock.now().toISOString() }) }),
    slow: pureCommand({ run: async ({ env }) => Promise.resolve({ key: env.NOTES_KEY === undefined ? "absent" : "present" }) }),
  },
};

type Run = { readonly envelope: Envelope; readonly stderr: string; readonly home: string };

const run = async (t: TestContext, argv: readonly string[], options: { stdin?: string; home?: string; env?: Record<string, string> } = {}): Promise<Run> => {
  const home = options.home ?? mkdtempSync(join(tmpdir(), "ambitious-kit-cli-"));
  if (options.home === undefined) t.after(() => rmSync(home, { recursive: true, force: true }));
  const stderr: string[] = [];
  const io: Io = {
    argv,
    env: { AMBITIOUS_HOME: home, ...options.env },
    binaryPath: import.meta.filename,
    readStdin: () => Promise.resolve(options.stdin ?? ""),
    systemNow: () => new Date("2030-06-01T12:00:00Z"),
    systemSeed: () => 123,
    writeStdout: () => undefined,
    writeStderr: (text) => stderr.push(text),
  };
  const envelope = await cliEnvelope(spec, io);
  assert.deepEqual(envelopeProblems(envelope), []);
  return { envelope, stderr: stderr.join(""), home };
};

const codes = ({ envelope }: Run): readonly string[] => envelope.errors.map(({ code }) => code);

test("a write command stores its change and a read command sees it", async (t) => {
  const added = await run(t, ["add", "--now", NOW, "--seed", "7"], { stdin: '{"body":"first"}' });
  assert.deepEqual(added.envelope.data, { added: "first" });
  assert.deepEqual(added.envelope.meta, { now: "2026-01-01T00:00:00.000Z", seed: 7, version: "0.1.0" });
  const counted = await run(t, ["count"], { home: added.home });
  assert.deepEqual(counted.envelope.data, { count: 1 });
  assert.equal(counted.envelope.command, "count");
});

test("when --now and --seed are omitted the shell's clock and seed are used and echoed", async (t) => {
  const rolled = await run(t, ["dice", "roll"]);
  assert.equal(rolled.envelope.command, "dice roll");
  assert.deepEqual(rolled.envelope.meta, { now: "2030-06-01T12:00:00.000Z", seed: 123, version: "0.1.0" });
  const again = await run(t, ["dice", "roll", "--now=2030-06-01T12:00:00Z", "--seed=123", "--json"]);
  assert.deepEqual(again.envelope, rolled.envelope);
});

test("a write command that fails leaves no trace in the database", async (t) => {
  const { home } = await run(t, ["add"], { stdin: '{"body":"kept"}' });
  const refused = await run(t, ["add"], { stdin: '{"body":"refuse me"}', home });
  assert.deepEqual(codes(refused), ["E_REFUSED"]);
  assert.deepEqual(refused.envelope.data, { body: "refuse me" });
  assert.equal(exitCodeOf(refused.envelope), 1);
  const crashed = await run(t, ["add"], { stdin: '{"body":"crash"}', home });
  assert.deepEqual(codes(crashed), ["E_INTERNAL"]);
  assert.equal(exitCodeOf(crashed.envelope), 2);
  assert.match(crashed.stderr, /TypeError: a bug in the module/);
  assert.doesNotMatch(JSON.stringify(crashed.envelope), /a bug in the module/);
  assert.deepEqual((await run(t, ["count"], { home })).envelope.data, { count: 1 });
});

test("a read command cannot write, and fails with E_MIGRATION until selfcheck has created the database", async (t) => {
  const early = await run(t, ["count"]);
  assert.deepEqual(codes(early), ["E_MIGRATION"]);
  assert.equal(existsSync(join(early.home, "notes")), false);
  const { home } = await run(t, ["add"], { stdin: '{"body":"kept"}' });
  const sneaky = await run(t, ["count", "sneaky"], { home });
  assert.deepEqual(codes(sneaky), ["E_DB"]);
  assert.match(sneaky.stderr, /readonly/);
  assert.deepEqual((await run(t, ["count"], { home })).envelope.data, { count: 1 });
});

test("input problems are E_INPUT_SCHEMA and usage problems are E_USAGE, each with the command it knows", async (t) => {
  const file = join(mkdtempSync(join(tmpdir(), "ambitious-kit-input-")), "note.json");
  t.after(() => rmSync(join(file, ".."), { recursive: true }));
  writeFileSync(file, '{"body":"from a file"}');
  assert.deepEqual((await run(t, ["add", "--in", file])).envelope.data, { added: "from a file" });
  const cases: readonly (readonly [readonly string[], string | undefined, string, string])[] = [
    [["add"], undefined, "E_INPUT_SCHEMA", "add"],
    [["add"], "not json", "E_INPUT_SCHEMA", "add"],
    [["add"], '{"body":7}', "E_INPUT_SCHEMA", "add"],
    [["add", "--in", join(file, "missing.json")], undefined, "E_INPUT_SCHEMA", "add"],
    [["add", "--in", file], '{"body":"both"}', "E_USAGE", "add"],
    [["count", "--in", file], undefined, "E_USAGE", "count"],
    [[], undefined, "E_USAGE", ""],
    [["cuont"], undefined, "E_USAGE", ""],
    [["dice"], undefined, "E_USAGE", ""],
    [["count", "--verbose"], undefined, "E_USAGE", "count"],
    [["count", "--now", "noon"], undefined, "E_USAGE", "count"],
    [["count", "--seed", "4294967296"], undefined, "E_USAGE", "count"],
    [["count", "--seed"], undefined, "E_USAGE", "count"],
    [["count", "--seed", "1", "--seed", "2"], undefined, "E_USAGE", "count"],
    [["count", "--db="], undefined, "E_USAGE", "count"],
    [["count", "--db", ""], undefined, "E_USAGE", "count"],
    [["__proto__"], undefined, "E_USAGE", ""],
  ];
  for (const [argv, stdin, code, command] of cases) {
    const result = await run(t, argv, stdin === undefined ? {} : { stdin });
    assert.deepEqual([codes(result), result.envelope.command], [[code], command], argv.join(" "));
    assert.equal(exitCodeOf(result.envelope), 1);
  }
  const unknown = await run(t, ["cuont"]);
  assert.equal(unknown.envelope.errors[0]?.hint, "Use one of: add, commands, count, count sneaky, dice roll, selfcheck, slow.");
});

test("input is checked before the database is opened, so a refused write creates nothing", async (t) => {
  const refused = await run(t, ["add"], { stdin: '{"body":7}' });
  assert.deepEqual(codes(refused), ["E_INPUT_SCHEMA"]);
  assert.equal(existsSync(join(refused.home, "notes")), false);
});

test("every given path is checked against the bot's private data directory before anything else happens", async (t) => {
  const forbidden = "/home/box/agent-data";
  const attempts: readonly (readonly [readonly string[], Record<string, string>])[] = [
    [["count", "--db", `${forbidden}/notes.sqlite`], {}],
    [["add", "--in", `${forbidden}/note.json`], {}],
    [["selfcheck"], { AMBITIOUS_HOME: forbidden }],
    [["slow"], { AMBITIOUS_HOME: `${forbidden}/home` }],
  ];
  for (const [argv, env] of attempts) assert.deepEqual(codes(await run(t, argv, { env })), ["E_FORBIDDEN_PATH"], argv.join(" "));
});

test("selfcheck creates and migrates the database, then changes nothing on later runs", async (t) => {
  const first = await run(t, ["selfcheck", "--now", NOW, "--seed", "7"]);
  const db = isRecord(first.envelope.data.db) ? first.envelope.data.db : {};
  assert.equal(first.envelope.ok, true);
  assert.deepEqual(
    { ...db, path: undefined },
    { path: undefined, integrityCheck: "ok", userVersion: 1, migrationsApplied: ["0001_create_notes"] },
  );
  assert.equal(db.path, join(first.home, "notes", "notes.sqlite"));
  assert.deepEqual(first.envelope.data.problems, []);
  assert.deepEqual(first.envelope.data.runtime, { name: "node", version: process.versions.node });
  const second = await run(t, ["selfcheck", "--now", NOW, "--seed", "7"], { home: first.home });
  assert.deepEqual(isRecord(second.envelope.data.db) ? second.envelope.data.db.migrationsApplied : null, []);
  const elsewhere = await run(t, ["selfcheck", "--db", join(first.home, "other", "place.sqlite")], { home: first.home });
  assert.equal(elsewhere.envelope.ok, true);
  assert.ok(existsSync(join(first.home, "other", "place.sqlite")));
});

test("selfcheck on a damaged database still reports what it could read, lists the problem and exits 2", async (t) => {
  const { home } = await run(t, ["slow"]);
  const garbage = join(home, "garbage.sqlite");
  writeFileSync(garbage, "this file is not a database\n".repeat(64));
  const result = await run(t, ["selfcheck", "--db", garbage], { home });
  assert.deepEqual(codes(result), ["E_DB"]);
  assert.equal(exitCodeOf(result.envelope), 2);
  assert.ok(Array.isArray(result.envelope.data.problems) && result.envelope.data.problems.length === 1);
  assert.ok(isRecord(result.envelope.data.binary) && typeof result.envelope.data.binary.sha256 === "string");
});

test("the built-in commands command lists every command with how it touches the database", async (t) => {
  const listed = await run(t, ["commands"]);
  assert.deepEqual(listed.envelope.data, {
    commands: [
      { name: "add", access: "write", input: true },
      { name: "commands", access: "none", input: false },
      { name: "count", access: "read", input: false },
      { name: "count sneaky", access: "read", input: false },
      { name: "dice roll", access: "none", input: false },
      { name: "selfcheck", access: "write", input: false },
      { name: "slow", access: "none", input: false },
    ],
  });
  assert.equal(existsSync(join(listed.home, "notes")), false);
});

test("a command may be asynchronous and reads its key only from the environment of that call", async (t) => {
  assert.deepEqual((await run(t, ["slow"])).envelope.data, { key: "absent" });
  assert.deepEqual((await run(t, ["slow"], { env: { NOTES_KEY: "k" } })).envelope.data, { key: "present" });
});

test("a module spec that breaks the naming rules is refused before any command runs", async () => {
  const io: Io = {
    argv: ["commands"],
    env: {},
    binaryPath: import.meta.filename,
    readStdin: () => Promise.resolve(""),
    systemNow: () => new Date(0),
    systemSeed: () => 0,
    writeStdout: () => undefined,
    writeStderr: () => undefined,
  };
  await assert.rejects(cliEnvelope({ ...spec, module: "Notes" }, io), /lower-case name/);
  await assert.rejects(cliEnvelope({ ...spec, commands: { selfcheck: spec.commands.add ?? pureCommand({ run: () => ({}) }) } }, io), /provided by the kit/);
});
