import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FLAG_USAGE, parseArgs, type Flags } from "../domain/args.ts";
import { fixedClock, MAX_SEED, parseNow, parseSeed, seededRng } from "../domain/clock.ts";
import {
  envelope,
  exitCodeOf,
  isCommandName,
  isModuleName,
  isSemver,
  serialize,
  type Envelope,
  type ErrorEntry,
  type Identity,
} from "../domain/envelope.ts";
import { Failure, failure } from "../domain/failure.ts";
import type { JsonObject } from "../domain/json.ts";
import type { Migration } from "../domain/migrations.ts";
import { requireCurrentSchema, migrate } from "../db/migrate.ts";
import { openDb, type Db } from "../db/open-db.ts";
import { ambitiousHome, refuseAgentData } from "../paths/refuse-agent-data.ts";
import { pureCommand, type Command } from "./command.ts";
import { selfcheck } from "./selfcheck.ts";

export type ModuleSpec = {
  readonly module: string;
  readonly version: string;
  readonly schemaVersion: number;
  readonly migrations: readonly Migration[];
  readonly commands: Readonly<Record<string, Command>>;
};

export type Io = {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly binaryPath: string;
  readonly readStdin: () => Promise<string>;
  readonly systemNow: () => Date;
  readonly systemSeed: () => number;
  readonly writeStdout: (text: string) => void;
  readonly writeStderr: (text: string) => void;
};

const BUILT_IN = ["selfcheck", "commands"];

const usage = (message: string, hint: string): Failure => failure("E_USAGE", message, hint);

const checkedSpec = (spec: ModuleSpec): void => {
  const names = Object.keys(spec.commands);
  const wrong = [
    ...(isModuleName(spec.module) ? [] : [`module "${spec.module}" must be the lower-case name after ambitious-`]),
    ...(isSemver(spec.version) ? [] : [`version "${spec.version}" must be a semantic version`]),
    ...(Number.isInteger(spec.schemaVersion) && spec.schemaVersion >= 1 ? [] : ["schemaVersion must be an integer, 1 or higher"]),
    ...names.filter((name) => !isCommandName(name)).map((name) => `command "${name}" must be lower-case words joined by one space`),
    ...names.filter((name) => BUILT_IN.includes(name)).map((name) => `command "${name}" is provided by the kit`),
  ];
  if (wrong.length > 0) throw new Error(`The module spec is not valid: ${wrong.join("; ")}.`);
};

const readInput = async (command: string, takesInput: boolean, flags: Flags, io: Io): Promise<unknown> => {
  if (!takesInput) {
    if (flags.in !== null) throw usage(`The command ${command} takes no input, but --in was given.`, "Remove --in.");
    return undefined;
  }
  const piped = await io.readStdin();
  if (flags.in !== null && piped.trim() !== "") {
    throw usage("Input was given both on stdin and with --in.", "Give the input JSON one way: on stdin or as a file named by --in.");
  }
  const text = (() => {
    if (flags.in === null) return piped;
    try {
      return readFileSync(flags.in, "utf8");
    } catch {
      throw failure("E_INPUT_SCHEMA", `The input file ${flags.in} could not be read.`, "Pass --in the path of a readable JSON file.");
    }
  })();
  if (text.trim() === "") {
    throw failure("E_INPUT_SCHEMA", `The command ${command} needs input and got none.`, "Send a JSON object on stdin or with --in.");
  }
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    throw failure("E_INPUT_SCHEMA", "The input is not valid JSON.", "Send one JSON object on stdin or with --in.");
  }
};

const inTransaction = async (db: Db, work: () => JsonObject | Promise<JsonObject>): Promise<JsonObject> => {
  db.exec("BEGIN IMMEDIATE");
  try {
    const data = await work();
    db.exec("COMMIT");
    return data;
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
};

const isSqliteError = (error: unknown): error is Error =>
  error instanceof Error && "code" in error && error.code === "ERR_SQLITE_ERROR";

const errorsOf = (error: unknown, io: Io): { readonly errors: readonly [ErrorEntry, ...ErrorEntry[]]; readonly data: JsonObject } => {
  if (error instanceof Failure) return { errors: error.errors, data: error.data };
  io.writeStderr(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  if (isSqliteError(error)) {
    return {
      errors: [{ code: "E_DB", message: `The database could not be read or written: ${error.message}.`, hint: "Run selfcheck and read data.problems." }],
      data: {},
    };
  }
  return {
    errors: [{ code: "E_INTERNAL", message: "The module hit an unexpected error.", hint: "Report it with the stderr log." }],
    data: {},
  };
};

export const cliEnvelope = async (spec: ModuleSpec, io: Io): Promise<Envelope> => {
  checkedSpec(spec);
  const { words, flags, problems } = parseArgs(io.argv);
  const now = flags.now === null ? io.systemNow() : parseNow(flags.now);
  const seed = flags.seed === null ? io.systemSeed() : parseSeed(flags.seed);
  const instant = now ?? io.systemNow();
  const usedSeed = seed ?? io.systemSeed();
  const meta = { now: instant.toISOString(), seed: usedSeed, version: spec.version };
  const identity = (command: string): Identity => ({ schemaVersion: spec.schemaVersion, module: spec.module, command, meta });

  const describeCommands = (): JsonObject => ({
    commands: Object.entries(commands)
      .map(([name, { access, takesInput }]) => ({ name, access, input: takesInput }))
      .sort((a, b) => (a.name < b.name ? -1 : 1)),
  });
  const commands: Readonly<Record<string, Command>> = {
    ...spec.commands,
    selfcheck: { access: "write", takesInput: false, parse: () => () => ({}) },
    commands: pureCommand({ run: describeCommands }),
  };
  const name = words.join(" ");
  const command = Object.hasOwn(commands, name) ? commands[name] : undefined;
  const valid = Object.keys(commands).sort().join(", ");
  const usageErrors: readonly Failure[] = [
    ...(words.length === 0 ? [usage("No command was given.", `Use one of: ${valid}.`)] : []),
    ...(words.length > 0 && command === undefined ? [usage(`Unknown command "${name}".`, `Use one of: ${valid}.`)] : []),
    ...problems.map((problem) => usage(problem, `Use only these flags: ${FLAG_USAGE}.`)),
    ...(now === null ? [usage(`The --now value "${flags.now}" is not a time with a time zone.`, "Use ISO 8601 with Z or an offset, for example 2026-01-01T00:00:00Z.")] : []),
    ...(seed === null ? [usage(`The --seed value "${flags.seed}" is not an integer from 0 to ${MAX_SEED}.`, `Use a whole number from 0 to ${MAX_SEED}.`)] : []),
  ];
  const [firstUsage, ...moreUsage] = usageErrors.flatMap(({ errors }) => errors);
  if (firstUsage !== undefined || command === undefined) {
    return envelope.err(identity(command === undefined ? "" : name), [
      firstUsage ?? { code: "E_USAGE", message: "No command was given.", hint: `Use one of: ${valid}.` },
      ...moreUsage,
    ]);
  }

  const connection: { db: Db | null } = { db: null };
  try {
    const home = ambitiousHome(io.env);
    const dbPath = refuseAgentData(flags.db ?? join(home, spec.module, `${spec.module}.sqlite`));
    if (flags.in !== null) refuseAgentData(flags.in);
    const run = command.parse(await readInput(name, command.takesInput, flags, io));
    if (name === "selfcheck") {
      return envelope.ok(identity(name), selfcheck({ module: spec.module, dbPath, binaryPath: io.binaryPath, migrations: spec.migrations }));
    }
    const runtime = {
      clock: fixedClock(instant),
      rng: seededRng(usedSeed),
      env: io.env,
      openDb: (): Db => {
        const opened = openDb(dbPath, { readonly: command.access === "read" });
        connection.db = opened;
        if (command.access === "read") requireCurrentSchema(opened, spec.migrations);
        else migrate(opened, spec.migrations);
        return opened;
      },
    };
    if (command.access !== "write") return envelope.ok(identity(name), await run(runtime));
    const opened = runtime.openDb();
    const data = await inTransaction(opened, () => run({ ...runtime, openDb: () => opened }));
    return envelope.ok(identity(name), data);
  } catch (error) {
    const { errors, data } = errorsOf(error, io);
    return envelope.err(identity(name), errors, data);
  } finally {
    connection.db?.close();
  }
};

const readAll = async (stream: NodeJS.ReadStream): Promise<string> => {
  if (stream.isTTY) return "";
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  } catch {
    return "";
  }
  return Buffer.concat(chunks).toString("utf8");
};

export const runCli = async (spec: ModuleSpec): Promise<void> => {
  const io: Io = {
    argv: process.argv.slice(2),
    env: process.env,
    binaryPath: process.argv[1] ?? "",
    readStdin: () => readAll(process.stdin),
    systemNow: () => new Date(),
    systemSeed: () => randomInt(0, MAX_SEED + 1),
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
  };
  const result = await cliEnvelope(spec, io).catch((error: unknown) => {
    io.writeStderr(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    return envelope.err(
      {
        schemaVersion: 1,
        module: isModuleName(spec.module) ? spec.module : "unknown",
        command: "",
        meta: { now: new Date().toISOString(), seed: 0, version: isSemver(spec.version) ? spec.version : "0.0.0" },
      },
      [{ code: "E_INTERNAL", message: "The module hit an unexpected error.", hint: "Report it with the stderr log." }],
    );
  });
  io.writeStdout(serialize(result));
  process.exitCode = exitCodeOf(result);
};
