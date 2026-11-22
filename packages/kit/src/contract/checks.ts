import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { envelopeProblems, INTERNAL_ERROR_CODES } from "../domain/envelope.ts";
import { FIELD_TYPES } from "../domain/input-shape.ts";
import { isRecord } from "../domain/json.ts";
import { AGENT_DATA_ROOT } from "../paths/refuse-agent-data.ts";

export type ContractResult = { readonly id: string; readonly title: string; readonly problems: readonly string[] };

type Invocation = {
  readonly args: readonly string[];
  readonly home: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly stdin?: string;
};

type Outcome = {
  readonly label: string;
  readonly status: number | null;
  readonly stdout: string;
  readonly envelope: Readonly<Record<string, unknown>> | null;
  readonly problems: readonly string[];
};

type Listed = { readonly name: string; readonly access: string; readonly input: boolean };

type Bench = {
  readonly binary: string;
  readonly run: (invocation: Invocation) => Outcome;
  readonly freshHome: () => string;
  readonly commands: () => readonly Listed[];
};

type Check = { readonly id: string; readonly title: string; readonly problems: (bench: Bench) => readonly string[] };

const NOW = "2026-01-01T00:00:00Z";
const NOW_ECHO = "2026-01-01T00:00:00.000Z";
const FIXED = ["--now", NOW, "--seed", "7"];
const RUN_TIMEOUT_MS = 60_000;

const launcher = (binary: string): readonly string[] => {
  const extension = extname(binary);
  if (extension === ".mjs" || extension === ".js") return [process.execPath, binary];
  if (extension === ".pyz") return ["python3", binary];
  return [binary];
};

const errorCodes = (envelope: Readonly<Record<string, unknown>>): readonly string[] =>
  Array.isArray(envelope.errors)
    ? envelope.errors.flatMap((entry: unknown) => (isRecord(entry) && typeof entry.code === "string" ? [entry.code] : []))
    : [];

const parseStdout = (stdout: string): { readonly envelope: Readonly<Record<string, unknown>> | null; readonly problems: readonly string[] } => {
  if (!stdout.endsWith("\n") || stdout.slice(0, -1).includes("\n")) {
    return { envelope: null, problems: [`stdout must be exactly one line ended by one newline, but was ${JSON.stringify(stdout.slice(0, 200))}.`] };
  }
  try {
    const value: unknown = JSON.parse(stdout);
    const shape = envelopeProblems(value);
    return { envelope: isRecord(value) ? value : null, problems: shape };
  } catch {
    return { envelope: null, problems: [`stdout must be one JSON envelope, but was ${JSON.stringify(stdout.slice(0, 200))}.`] };
  }
};

const expectedExit = (envelope: Readonly<Record<string, unknown>>): number => {
  if (envelope.ok === true) return 0;
  return errorCodes(envelope).some((code) => INTERNAL_ERROR_CODES.has(code)) ? 2 : 1;
};

const bench = (binary: string, homes: string[]): Bench => {
  const [program = binary, ...programArgs] = launcher(binary);
  const run = ({ args, home, env = {}, stdin = "" }: Invocation): Outcome => {
    const label = `\`${args.join(" ")}\``;
    const result = spawnSync(program, [...programArgs, ...args], {
      encoding: "utf8",
      input: stdin,
      timeout: RUN_TIMEOUT_MS,
      env: { ...process.env, AMBITIOUS_HOME: home, ...env },
    });
    if (result.error !== undefined) {
      return { label, status: null, stdout: "", envelope: null, problems: [`${label} could not be run: ${result.error.message}.`] };
    }
    const parsed = parseStdout(result.stdout);
    const exit =
      parsed.envelope !== null && result.status !== expectedExit(parsed.envelope)
        ? [`exited ${result.status}, but its envelope calls for exit ${expectedExit(parsed.envelope)} (0 for ok, 2 for E_DB, E_MIGRATION or E_INTERNAL, otherwise 1).`]
        : [];
    return {
      label,
      status: result.status,
      stdout: result.stdout,
      envelope: parsed.envelope,
      problems: [...parsed.problems, ...exit].map((problem) => `${label}: ${problem}`),
    };
  };
  const freshHome = (): string => {
    const home = mkdtempSync(join(tmpdir(), "ambitious-contract-"));
    homes.push(home);
    return home;
  };
  const commands = (): readonly Listed[] => {
    const data = run({ args: ["commands", ...FIXED], home: freshHome() }).envelope?.data;
    const listed = isRecord(data) && Array.isArray(data.commands) ? data.commands : [];
    return listed.flatMap((entry: unknown) =>
      isRecord(entry) && typeof entry.name === "string" && typeof entry.access === "string" && typeof entry.input === "boolean"
        ? [{ name: entry.name, access: entry.access, input: entry.input }]
        : [],
    );
  };
  return { binary, run, freshHome, commands };
};

const field = (value: unknown, ...path: readonly string[]): unknown =>
  path.reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), value);

const mustFail = (outcome: Outcome, code: string, exit: number): readonly string[] => {
  if (outcome.envelope === null) return outcome.problems;
  const codes = errorCodes(outcome.envelope);
  return [
    ...outcome.problems,
    ...(outcome.envelope.ok === false && codes.includes(code)
      ? []
      : [`${outcome.label}: must fail with ${code}, but answered ${outcome.envelope.ok === true ? "ok" : codes.join(", ")}.`]),
    ...(outcome.status === exit ? [] : [`${outcome.label}: must exit ${exit}, but exited ${outcome.status}.`]),
  ];
};

const mustSucceed = (outcome: Outcome): readonly string[] => {
  if (outcome.envelope === null || outcome.envelope.ok === true) return outcome.problems;
  return [...outcome.problems, `${outcome.label}: must succeed, but failed with ${errorCodes(outcome.envelope).join(", ")}.`];
};

const filesUnder = (directory: string): readonly string[] =>
  existsSync(directory) ? readdirSync(directory, { recursive: true }).map(String).sort() : [];

const sha256 = (path: string): string => createHash("sha256").update(readFileSync(path)).digest("hex");

const wordsOf = (name: string): readonly string[] => name.split(" ");

const envelopeShape = ({ binary, run, freshHome }: Bench): readonly string[] => {
  const home = freshHome();
  const selfcheck = run({ args: ["selfcheck", ...FIXED], home });
  const data = selfcheck.envelope?.data;
  const expectations: readonly (readonly [string, boolean])[] = [
    ["command must be \"selfcheck\"", selfcheck.envelope?.command === "selfcheck"],
    [`meta.now must echo --now as ${NOW_ECHO}`, field(selfcheck.envelope, "meta", "now") === NOW_ECHO],
    ["meta.seed must echo --seed 7", field(selfcheck.envelope, "meta", "seed") === 7],
    ["data.runtime.name and data.runtime.version must be strings", typeof field(data, "runtime", "name") === "string" && typeof field(data, "runtime", "version") === "string"],
    ["data.binary.sha256 must be the SHA-256 of the binary that ran", field(data, "binary", "sha256") === sha256(binary)],
    ["data.binary.path must be a string", typeof field(data, "binary", "path") === "string"],
    ["data.db.path must be under AMBITIOUS_HOME", String(field(data, "db", "path")).startsWith(home)],
    ["data.db.integrityCheck must be \"ok\" on a fresh database", field(data, "db", "integrityCheck") === "ok"],
    ["data.db.userVersion must be a whole number", Number.isInteger(field(data, "db", "userVersion"))],
    ["data.db.migrationsApplied must be a list", Array.isArray(field(data, "db", "migrationsApplied"))],
    ["data.problems must be an empty list when ok is true", JSON.stringify(field(data, "problems")) === "[]"],
  ];
  const listing = run({ args: ["commands", ...FIXED], home });
  const listed = field(listing.envelope, "data", "commands");
  const names = Array.isArray(listed) ? listed.map((entry: unknown) => field(entry, "name")) : [];
  const help = run({ args: ["--help", ...FIXED], home });
  const untouched = freshHome();
  const focused = run({ args: ["selfcheck", "--help", ...FIXED], home: untouched });
  const created = filesUnder(untouched);
  const selfcheckEntry = Array.isArray(listed) ? listed.filter((entry: unknown) => field(entry, "name") === "selfcheck") : [];
  const describesSelfcheck =
    focused.envelope?.command === "selfcheck" && isDeepStrictEqual(field(focused.envelope, "data", "commands"), selfcheckEntry);
  return [
    ...mustSucceed(selfcheck),
    ...(selfcheck.envelope === null ? [] : expectations.filter(([, holds]) => !holds).map(([rule]) => `${selfcheck.label}: ${rule}.`)),
    ...mustSucceed(listing),
    ...(names.includes("selfcheck") && names.includes("commands")
      ? []
      : [`${listing.label}: data.commands must list every command, including selfcheck and commands, each as { name, access, input }.`]),
    ...mustSucceed(help),
    ...(help.envelope === null || help.envelope.ok !== true || isDeepStrictEqual(field(help.envelope, "data", "commands"), listed)
      ? []
      : [`${help.label}: --help with no command must list every command in data.commands exactly as \`commands\` does.`]),
    ...mustSucceed(focused),
    ...(created.length === 0 ? [] : [`${focused.label}: --help must describe the command and not run it, but AMBITIOUS_HOME now holds ${created.join(", ")}.`]),
    ...(focused.envelope === null || focused.envelope.ok !== true || describesSelfcheck
      ? []
      : [`${focused.label}: --help with a command name must answer with command set to that name and data.commands holding that one command's entry exactly as \`commands\` lists it.`]),
  ];
};

const exitCodes = ({ run, freshHome }: Bench): readonly string[] => {
  const home = freshHome();
  const garbage = join(freshHome(), "garbage.sqlite");
  writeFileSync(garbage, "this file is not a database\n".repeat(64));
  const usage: readonly (readonly string[])[] = [
    [],
    ["no-such-command"],
    ["selfcheck", "--no-such-flag"],
    ["selfcheck", "--now", "2026-01-01T00:00:00"],
    ["selfcheck", "--now", "yesterday"],
    ["selfcheck", "--now", "2026-02-30T00:00:00Z"],
    ["selfcheck", "--seed", "-1"],
    ["selfcheck", "--seed", "4294967296"],
    ["selfcheck", "--seed", "1.5"],
    ["selfcheck", "--db"],
  ];
  const unknown = run({ args: ["no-such-command", ...FIXED], home });
  const broken = run({ args: ["selfcheck", "--db", garbage, ...FIXED], home });
  return [
    ...usage.flatMap((args) => mustFail(run({ args, home }), "E_USAGE", 1)),
    ...(unknown.envelope === null || unknown.envelope.command === "" ? [] : [`${unknown.label}: command must be "" when no known command was given.`]),
    ...mustSucceed(run({ args: ["selfcheck", ...FIXED], home })),
    ...mustFail(broken, "E_DB", 2),
    ...(broken.envelope === null || (Array.isArray(field(broken.envelope, "data", "problems")) && JSON.stringify(field(broken.envelope, "data", "problems")) !== "[]")
      ? []
      : [`${broken.label}: selfcheck must say what is wrong in data.problems.`]),
  ];
};

const nowDeterminism = ({ run, freshHome, commands }: Bench): readonly string[] => {
  const home = freshHome();
  const offset = ["--now", "2026-03-05T09:30:00+01:00", "--seed", "42"];
  const first = run({ args: ["selfcheck", ...offset], home });
  const second = run({ args: ["selfcheck", ...offset], home });
  const third = run({ args: ["selfcheck", ...offset, "--json"], home });
  const repeatable = commands()
    .filter(({ access, input }) => access !== "write" && !input)
    .flatMap(({ name }) => {
      const args = [...wordsOf(name), ...offset];
      const [a, b] = [run({ args, home }), run({ args, home })];
      return [...a.problems, ...(a.stdout === b.stdout ? [] : [`${a.label}: two runs with the same --now and --seed must print the same bytes.`])];
    });
  return [
    ...mustSucceed(first),
    ...(field(first.envelope, "meta", "now") === "2026-03-05T08:30:00.000Z" ? [] : [`${first.label}: meta.now must be the --now instant in UTC, 2026-03-05T08:30:00.000Z.`]),
    ...(field(first.envelope, "meta", "seed") === 42 ? [] : [`${first.label}: meta.seed must echo --seed 42.`]),
    ...(second.stdout === third.stdout ? [] : [`${third.label}: --json must change nothing, and two runs with the same --now and --seed must print the same bytes.`]),
    ...repeatable,
  ];
};

const agentDataRefusal = ({ run, freshHome, commands }: Bench): readonly string[] => {
  const home = freshHome();
  const linked = freshHome();
  symlinkSync(AGENT_DATA_ROOT, join(linked, "link"));
  const inside = `${AGENT_DATA_ROOT}/module.sqlite`;
  const everyCommand = commands().flatMap(({ name, input }) =>
    mustFail(run({ args: [...wordsOf(name), "--db", inside, ...FIXED], home, stdin: input ? "{}" : "" }), "E_FORBIDDEN_PATH", 1),
  );
  const variants: readonly Invocation[] = [
    { args: ["selfcheck", "--db", `${AGENT_DATA_ROOT}/../agent-data/module.sqlite`, ...FIXED], home },
    { args: ["selfcheck", "--db", join(linked, "link", "module.sqlite"), ...FIXED], home },
    { args: ["selfcheck", "--in", `${AGENT_DATA_ROOT}/input.json`, ...FIXED], home },
    { args: ["selfcheck", ...FIXED], home, env: { AMBITIOUS_HOME: AGENT_DATA_ROOT } },
    { args: ["selfcheck", ...FIXED], home, env: { AMBITIOUS_HOME: join(linked, "link", "home") } },
  ];
  const created = filesUnder(home);
  return [
    ...everyCommand,
    ...variants.flatMap((invocation) => mustFail(run(invocation), "E_FORBIDDEN_PATH", 1)),
    ...(created.length === 0 ? [] : [`A refused command must not create anything, but AMBITIOUS_HOME now holds ${created.join(", ")}.`]),
  ];
};

const readOnlyAnalysis = ({ run, freshHome, commands }: Bench): readonly string[] =>
  commands()
    .filter(({ access }) => access === "read")
    .flatMap(({ name, input }) => {
      const args = [...wordsOf(name), ...FIXED];
      const stdin = input ? "{}" : "";
      const empty = freshHome();
      const missing = run({ args, home: empty, stdin });
      const createdWhenMissing = filesUnder(empty);
      const home = freshHome();
      const prepared = run({ args: ["selfcheck", ...FIXED], home });
      const dbPath = field(prepared.envelope, "data", "db", "path");
      if (typeof dbPath !== "string" || !existsSync(dbPath)) return [...prepared.problems, `${prepared.label}: selfcheck must create the database and report its path in data.db.path.`];
      const before = sha256(dbPath);
      const analysis = run({ args, home, stdin });
      return [
        ...mustFail(missing, "E_MIGRATION", 2),
        ...(createdWhenMissing.length === 0 ? [] : [`${missing.label}: a read command must not create the database, but AMBITIOUS_HOME now holds ${createdWhenMissing.join(", ")}.`]),
        ...analysis.problems,
        ...(sha256(dbPath) === before ? [] : [`${analysis.label}: a read command must open the database with mode=ro, but the database file changed.`]),
      ];
    });

const noStdoutNoise = ({ run, freshHome, commands }: Bench): readonly string[] => {
  const home = freshHome();
  const garbage = join(freshHome(), "garbage.sqlite");
  writeFileSync(garbage, "this file is not a database\n".repeat(64));
  const invocations: readonly Invocation[] = [
    { args: ["selfcheck"], home },
    { args: [], home },
    { args: ["--help"], home },
    { args: ["selfcheck", "--db", garbage], home },
    ...commands().flatMap(({ name, input }) => [
      { args: wordsOf(name), home, stdin: input ? "{}" : "" },
      ...(input ? [{ args: wordsOf(name), home, stdin: "this is not JSON" }, { args: wordsOf(name), home }] : []),
    ]),
  ];
  return invocations.flatMap((invocation) => run(invocation).problems);
};

const FIELD_RULE = `each field as { name, type, required }, with type one of ${FIELD_TYPES.join(", ")}`;

type ListedField = { readonly name: string; readonly required: boolean };

const listedFields = (fields: unknown): readonly ListedField[] | null => {
  if (!Array.isArray(fields)) return null;
  const read = fields.flatMap((entry: unknown) =>
    isRecord(entry) &&
    typeof entry.name === "string" &&
    typeof entry.type === "string" &&
    FIELD_TYPES.some((type) => type === entry.type) &&
    typeof entry.required === "boolean"
      ? [{ name: entry.name, required: entry.required }]
      : [],
  );
  return read.length === fields.length ? read : null;
};

const without = (example: Readonly<Record<string, unknown>>, dropped: string): string =>
  JSON.stringify(Object.fromEntries(Object.entries(example).filter(([key]) => key !== dropped)));

const shapeProblemsOf = ({ run, freshHome }: Bench, entry: Readonly<Record<string, unknown>>): readonly string[] => {
  const { name, input, fields, example } = entry;
  if (typeof name !== "string" || (fields === undefined && example === undefined)) return [];
  const label = `\`commands\`: the command "${name}"`;
  if (input !== true) return [`${label} lists fields or an example, but its input is not true.`];
  const read = listedFields(fields);
  if (read === null) return [`${label} must list ${FIELD_RULE}.`];
  if (example === undefined) return [];
  if (!isRecord(example)) return [`${label} must give its example as one JSON object.`];
  const required = read.filter((listed) => listed.required).map((listed) => listed.name);
  const missing = required.filter((key) => !Object.hasOwn(example, key));
  if (missing.length > 0) return [`${label} lists ${missing.join(", ")} as required, but its example leaves ${missing.length === 1 ? "it" : "them"} out.`];
  const args = [...wordsOf(name), ...FIXED];
  const sent = run({ args, home: freshHome(), stdin: JSON.stringify(example) });
  return [
    ...sent.problems,
    ...(sent.envelope !== null && errorCodes(sent.envelope).includes("E_INPUT_SCHEMA")
      ? [`${label} lists an example that is refused with E_INPUT_SCHEMA. The example is sent as input, so it must be valid input.`]
      : []),
    ...required.flatMap((key) => {
      const outcome = run({ args, home: freshHome(), stdin: without(example, key) });
      if (outcome.envelope === null) return outcome.problems;
      const codes = errorCodes(outcome.envelope);
      return [
        ...outcome.problems,
        ...(outcome.envelope.ok === false && codes.includes("E_INPUT_SCHEMA")
          ? []
          : [`${label} lists the field "${key}" as required, so the example without it must fail with E_INPUT_SCHEMA, but it answered ${outcome.envelope.ok === true ? "ok" : codes.join(", ")}.`]),
      ];
    }),
  ];
};

const listedShapes = (bench: Bench): readonly string[] => {
  const listing = bench.run({ args: ["commands", ...FIXED], home: bench.freshHome() });
  const listed = field(listing.envelope, "data", "commands");
  const entries: readonly unknown[] = Array.isArray(listed) ? listed : [];
  return [...mustSucceed(listing), ...entries.flatMap((entry) => (isRecord(entry) ? shapeProblemsOf(bench, entry) : []))];
};

const CHECKS: readonly Check[] = [
  { id: "envelope-shape", title: "Every command prints one envelope that matches the schema", problems: envelopeShape },
  { id: "exit-codes", title: "Exit code is 0 for ok, 1 for a caller error, 2 for an internal error", problems: exitCodes },
  { id: "now-determinism", title: "--now and --seed are echoed, and the same run prints the same bytes", problems: nowDeterminism },
  { id: "agent-data-refusal", title: "Every path under the bot's private data directory is refused", problems: agentDataRefusal },
  { id: "read-only-analysis", title: "Read commands never create or change the database", problems: readOnlyAnalysis },
  { id: "no-stdout-noise", title: "Nothing but the envelope is ever written to stdout", problems: noStdoutNoise },
  { id: "listed-shapes", title: "A listed example is valid input, and a field listed as required is required", problems: listedShapes },
];

export const runContract = (binPath: string): readonly ContractResult[] => {
  const binary = resolve(binPath);
  if (!existsSync(binary)) return [{ id: "binary", title: "The binary exists", problems: [`${binary} does not exist. Build the module first.`] }];
  return CHECKS.map(({ id, title, problems }) => {
    const homes: string[] = [];
    try {
      return { id, title, problems: problems(bench(binary, homes)) };
    } finally {
      for (const home of homes) rmSync(home, { recursive: true, force: true });
    }
  });
};
