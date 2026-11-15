import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { envelope, exitCodeOf, serialize, type ErrorEntry, type Identity } from "../domain/envelope.ts";
import { Failure, failure } from "../domain/failure.ts";
import type { JsonObject } from "../domain/json.ts";
import { identifyConnection, parseConnectorOffers } from "../domain/connection.ts";
import { instructionsMessage, needsOwner, parseInstructionsCatalogue } from "../domain/instructions.ts";
import { parseLock, type LockRow } from "../domain/lock.ts";
import { parseTemplateRoutines } from "../domain/routines.ts";
import { decideSkillWrite, parseSkillOffers } from "../domain/skill-version.ts";
import { checkInstructions, PROPOSED_INSTRUCTIONS_FILE } from "../install/instructions.ts";
import { templateNote, templateStatus, type TemplateStatus } from "../install/newer-template.ts";
import { INSTALLER_MODULE, releaseDownload } from "../install/release.ts";
import { checkRoutines, proposedRoutineFile } from "../install/routines.ts";
import { findPython, summaryOf, sync } from "../install/sync.ts";
import { fixturesDirectory, parseTemplateFiles, placeTemplateFiles } from "../install/template-files.ts";
import { ambitiousHome, refuseAgentData } from "../paths/refuse-agent-data.ts";
import { embedded, embeddedInstructions, embeddedLock, embeddedRoutines, embeddedTemplateFiles } from "./embedded.ts";

const USAGE =
  "ambitious-modules sync [--json] [--from <mirror directory>] [--lock <lock file>] [--instructions <file holding the bot's current instructions>] [--routines <file listing the bot's current routines>], ambitious-modules skills [--json] [--in <file>], or ambitious-modules connection [--json] [--in <file>]";

const COMMANDS = ["sync", "skills", "connection"] as const;

type Command = (typeof COMMANDS)[number];

type Wanted = {
  readonly command: Command;
  readonly mirror: string | null;
  readonly lockFile: string | null;
  readonly inFile: string | null;
  readonly instructionsFile: string | null;
  readonly routinesFile: string | null;
};

type Environment = Readonly<Record<string, string | undefined>>;

const STDIN = 0;

const wrong = (message: string): Failure => failure("E_USAGE", message, `Run it as: ${USAGE}`);

const commandIn = (argv: readonly string[]): Command | null => COMMANDS.find((name) => argv.includes(name)) ?? null;

const wanted = (argv: readonly string[], environment: Environment): Wanted => {
  const { positionals, values } = (() => {
    try {
      return parseArgs({
        args: [...argv],
        allowPositionals: true,
        options: { from: { type: "string" }, lock: { type: "string" }, in: { type: "string" }, instructions: { type: "string" }, routines: { type: "string" }, json: { type: "boolean" } },
      });
    } catch (error) {
      throw wrong(error instanceof Error ? `${error.message}.` : "The arguments could not be read.");
    }
  })();
  const command = COMMANDS.find((name) => name === positionals[0]);
  if (positionals.length !== 1 || command === undefined) throw wrong("The commands are sync, skills and connection.");
  if (command !== "sync" && (values.from !== undefined || values.lock !== undefined || values.instructions !== undefined || values.routines !== undefined)) throw wrong(`The ${command} command takes only --in.`);
  if (command === "sync" && values.in !== undefined) throw wrong("The sync command takes no --in.");
  const mirror = values.from ?? environment.AMBITIOUS_MODULE_MIRROR ?? "";
  return { command, mirror: mirror === "" ? null : mirror, lockFile: values.lock ?? null, inFile: values.in ?? null, instructionsFile: values.instructions ?? null, routinesFile: values.routines ?? null };
};

const jsonFrom = (file: string | number, what: string, hint: string): unknown => {
  const source = typeof file === "string" ? refuseAgentData(file) : file;
  try {
    return JSON.parse(readFileSync(source, "utf8"));
  } catch (error) {
    throw failure("E_INPUT_SCHEMA", `${what} could not be read as JSON: ${error instanceof Error ? error.message : String(error)}.`, hint);
  }
};

const lockFrom = (file: string): readonly LockRow[] =>
  parseLock(jsonFrom(file, `The lock file ${file}`, "Name a JSON lock file, or leave --lock out to use the pins that came with this installer."));

const syncData = async ({ mirror, lockFile, instructionsFile, routinesFile }: Wanted, version: string, environment: Environment): Promise<JsonObject> => {
  const home = ambitiousHome(environment);
  const rows = lockFile === null ? parseLock(embeddedLock()) : lockFrom(lockFile);
  const catalogue = parseInstructionsCatalogue(embeddedInstructions());
  const instructions = checkInstructions(instructionsFile, home, catalogue);
  const templateRoutines = parseTemplateRoutines(embeddedRoutines());
  const { messages: aboutRoutines, ...routines } = checkRoutines(routinesFile, home, templateRoutines);
  placeTemplateFiles(
    home,
    new Map([
      ...parseTemplateFiles(embeddedTemplateFiles()),
      [PROPOSED_INSTRUCTIONS_FILE, catalogue.text],
      ...templateRoutines.map(({ name, prompt }) => [proposedRoutineFile(name), `${prompt}\n`] as const),
    ]),
  );
  const fixtures = fixturesDirectory(home);
  const aboutInstructions = instructions.state === "not checked" ? null : instructionsMessage(instructions, instructions.proposed, instructions.permissions);
  const instructionsNeedOwner = instructions.state !== "not checked" && needsOwner(instructions);
  const status: TemplateStatus =
    lockFile === null ? await templateStatus(version, mirror) : { update: "not checked", why: "A lock file was named, so its pins were used as given." };
  const note = lockFile === null ? templateNote(version, status) : null;
  const reports = await sync({
    rows,
    home,
    sourceFor: (row) => releaseDownload(row, mirror),
    runtimes: { node: process.execPath, python: findPython },
    environment: { ...environment, AMBITIOUS_HOME: home },
  });
  return {
    home,
    bin: join(home, "bin"),
    source: mirror === null ? "the release addresses in the lock" : `the mirror directory ${mirror}`,
    template: { version, fixtures, ...status },
    instructions,
    routines,
    modules: reports,
    problems: [
      ...reports.flatMap((report) => report.problems.map((problem) => `ambitious-${report.module}: ${problem}`)),
      ...(aboutInstructions !== null && instructionsNeedOwner ? [aboutInstructions] : []),
      ...aboutRoutines,
    ],
    notes: [...(note === null ? [] : [note]), ...(aboutInstructions !== null && !instructionsNeedOwner ? [aboutInstructions] : [])],
    summary: summaryOf(reports),
  };
};

const skillsData = ({ inFile }: Wanted): JsonObject => {
  const decisions = parseSkillOffers(jsonFrom(inFile ?? STDIN, inFile === null ? "The input on stdin" : `The input file ${inFile}`, "Pass the list of skills as JSON on stdin or with --in."));
  const skills = decisions.map(decideSkillWrite);
  return { skills, tellOwner: skills.flatMap(({ tellOwner }) => (tellOwner === null ? [] : [tellOwner])) };
};

const connectionData = ({ inFile }: Wanted): JsonObject => ({
  ...identifyConnection(parseConnectorOffers(jsonFrom(inFile ?? STDIN, inFile === null ? "The input on stdin" : `The input file ${inFile}`, "Pass the list of connectors as JSON on stdin or with --in."))),
});

const dataFor = async (request: Wanted, version: string, environment: Environment): Promise<JsonObject> => {
  if (request.command === "sync") return syncData(request, version, environment);
  return request.command === "skills" ? skillsData(request) : connectionData(request);
};

const run = async (argv: readonly string[], environment: Environment): Promise<{ readonly stdout: string; readonly exitCode: number }> => {
  const { version } = embedded();
  const identity: Identity = { schemaVersion: 1, module: INSTALLER_MODULE, command: commandIn(argv) ?? "sync", meta: { now: new Date().toISOString(), seed: 0, version } };
  const printed = (result: ReturnType<typeof envelope.ok> | ReturnType<typeof envelope.err>): { readonly stdout: string; readonly exitCode: number } => ({
    stdout: serialize(result),
    exitCode: exitCodeOf(result),
  });
  try {
    const request = wanted(argv, environment);
    return printed(envelope.ok({ ...identity, command: request.command }, await dataFor(request, version, environment)));
  } catch (error) {
    if (error instanceof Failure) return printed(envelope.err(identity, error.errors, error.data));
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    const internal: ErrorEntry = { code: "E_INTERNAL", message: "The installer hit an unexpected error.", hint: "Report it with the stderr log." };
    return printed(envelope.err(identity, [internal]));
  }
};

const result = await run(process.argv.slice(2), process.env);
process.stdout.write(result.stdout);
process.exitCode = result.exitCode;
