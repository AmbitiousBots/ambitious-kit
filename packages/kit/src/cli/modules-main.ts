import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, type ParseArgsOptionsConfig } from "node:util";
import { envelope, exitCodeOf, isCommandName, serialize, type ErrorEntry, type Identity } from "../domain/envelope.ts";
import { Failure, failure } from "../domain/failure.ts";
import type { JsonObject } from "../domain/json.ts";
import { identifyConnection, parseConnectorOffers } from "../domain/connection.ts";
import { guideFor, parseGuides } from "../domain/guides.ts";
import { instructionsMessage, needsOwner, parseInstructionsCatalogue } from "../domain/instructions.ts";
import { parseLock, type LockRow } from "../domain/lock.ts";
import { parseHighPriority } from "../domain/review-page.ts";
import { parseTemplateRoutines } from "../domain/routines.ts";
import { decideSkillWrite, parseSkillOffers, skillChange, withTemplateBodies } from "../domain/skill-version.ts";
import { parseTemplateSkills, withInstallerPin, type TemplateSkill } from "../domain/template-skills.ts";
import { placeGuideFile } from "../install/guide-files.ts";
import { checkInstructions, PROPOSED_INSTRUCTIONS_FILE } from "../install/instructions.ts";
import { mergeInstructions } from "../install/instructions-merge.ts";
import { templateNote, templateStatus, type TemplateStatus } from "../install/newer-template.ts";
import { INSTALLER_MODULE, releaseDownload } from "../install/release.ts";
import { reviewPage } from "../install/review-page.ts";
import { systemTool } from "../install/runtime.ts";
import { checkRoutines, proposedRoutineFile } from "../install/routines.ts";
import { placeSkillFiles, skillsDirectory } from "../install/skill-files.ts";
import { selfUpdate } from "../install/self-update.ts";
import { findPython, summaryOf, sync } from "../install/sync.ts";
import { fixturesDirectory, parseTemplateFiles, placeTemplateFiles } from "../install/template-files.ts";
import { sha256Of } from "../install/text-file.ts";
import { ambitiousHome, refuseAgentData } from "../paths/refuse-agent-data.ts";
import { embedded, embeddedGuides, embeddedInstructions, embeddedLock, embeddedRoutines, embeddedSkills, embeddedTemplateFiles } from "./embedded.ts";

const USAGE =
  "ambitious-modules sync [--json] [--from <mirror directory>] [--lock <lock file>] [--runtime <module whose pinned runtime to build>] [--instructions <file holding the bot's current instructions>] [--routines <file listing the bot's current routines>], ambitious-modules skill-files [--json], ambitious-modules skills [--json] [--in <file>], ambitious-modules connection [--json] [--in <file>], ambitious-modules self-update --version <version> --sha256 <hex> [--json], ambitious-modules instructions-merge --current <file> --published <file> --published-sha256 <hex> [--json], ambitious-modules guide [<topic>] [--json], or ambitious-modules review-page [--built] [--in <file listing the ids of the high-priority findings>] [--json]";

const COMMANDS = ["sync", "skill-files", "skills", "connection", "self-update", "instructions-merge", "guide", "review-page"] as const;

const OPTIONS = {
  from: { type: "string" },
  lock: { type: "string" },
  in: { type: "string" },
  instructions: { type: "string" },
  routines: { type: "string" },
  runtime: { type: "string" },
  version: { type: "string" },
  sha256: { type: "string" },
  current: { type: "string" },
  published: { type: "string" },
  "published-sha256": { type: "string" },
  built: { type: "boolean" },
  json: { type: "boolean" },
} satisfies ParseArgsOptionsConfig;

type Command = (typeof COMMANDS)[number];

type Wanted = {
  readonly command: Command;
  readonly mirror: string | null;
  readonly lockFile: string | null;
  readonly inFile: string | null;
  readonly instructionsFile: string | null;
  readonly routinesFile: string | null;
  readonly runtimeModule: string | null;
  readonly version: string;
  readonly sha256: string;
  readonly currentFile: string;
  readonly publishedFile: string;
  readonly publishedSha256: string;
  readonly topic: string | null;
  readonly built: boolean;
};

type Environment = Readonly<Record<string, string | undefined>>;

const STDIN = 0;

const wrong = (message: string): Failure => failure("E_USAGE", message, `Run it as: ${USAGE}`);

const commandGiven = (argv: readonly string[]): string => {
  try {
    const first = parseArgs({ args: [...argv], allowPositionals: true, strict: false, options: OPTIONS }).positionals[0];
    return first !== undefined && isCommandName(first) ? first : "";
  } catch {
    return "";
  }
};

const wanted = (argv: readonly string[], environment: Environment): Wanted => {
  const { positionals, values } = (() => {
    try {
      return parseArgs({ args: [...argv], allowPositionals: true, options: OPTIONS });
    } catch (error) {
      throw wrong(error instanceof Error ? `${error.message}.` : "The arguments could not be read.");
    }
  })();
  const command = COMMANDS.find((name) => name === positionals[0]);
  if (command === undefined || positionals.length > (command === "guide" ? 2 : 1)) throw wrong(`The commands are ${COMMANDS.join(", ")}.`);
  const allowed: Record<Command, readonly string[]> = {
    sync: ["from", "lock", "instructions", "routines", "runtime"],
    "skill-files": [],
    skills: ["in"],
    connection: ["in"],
    "self-update": ["version", "sha256"],
    "instructions-merge": ["current", "published", "published-sha256"],
    guide: [],
    "review-page": ["built", "in"],
  };
  for (const name of Object.keys(values)) {
    if (name !== "json" && !allowed[command].includes(name)) throw wrong(`The ${command} command takes no --${name}.`);
  }
  if (command === "self-update" || command === "instructions-merge") {
    for (const name of allowed[command]) {
      if (!Object.entries(values).some(([key, value]) => key === name && typeof value === "string" && value !== "")) throw wrong(`The ${command} command needs --${name}.`);
    }
  }
  const mirror = values.from ?? environment.AMBITIOUS_MODULE_MIRROR ?? "";
  return { command, mirror: mirror === "" ? null : mirror, lockFile: values.lock ?? null, inFile: values.in ?? null, instructionsFile: values.instructions ?? null, routinesFile: values.routines ?? null, runtimeModule: values.runtime ?? null, version: values.version ?? "", sha256: values.sha256 ?? "", currentFile: values.current ?? "", publishedFile: values.published ?? "", publishedSha256: values["published-sha256"] ?? "", topic: positionals[1] ?? null, built: values.built === true };
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

const syncData = async ({ mirror, lockFile, instructionsFile, routinesFile, runtimeModule }: Wanted, version: string, environment: Environment): Promise<JsonObject> => {
  const home = ambitiousHome(environment);
  const rows = lockFile === null ? parseLock(embeddedLock()) : lockFrom(lockFile);
  if (runtimeModule !== null && !rows.some((row) => row.module === runtimeModule && row.runtimeSha256 !== undefined)) {
    const withRuntime = rows.filter((row) => row.runtimeSha256 !== undefined).map((row) => row.module);
    throw wrong(`The lock pins no runtime for "${runtimeModule}". ${withRuntime.length === 0 ? "No pinned module releases a runtime." : `The modules that pin one are ${withRuntime.join(", ")}.`}`);
  }
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
  const status: TemplateStatus =
    lockFile === null ? await templateStatus(version, mirror) : { update: "not checked", why: "A lock file was named, so its pins were used as given." };
  const newer = status.update === "available" ? { own: version, latest: status.latest } : null;
  const aboutInstructions = instructions.state === "not checked" ? null : instructionsMessage(instructions, instructions.proposed, instructions.permissions, newer);
  const instructionsNeedOwner = instructions.state !== "not checked" && needsOwner(instructions);
  const note = lockFile === null ? templateNote(version, status) : null;
  const reports = await sync({
    rows,
    home,
    sourceFor: (row) => releaseDownload(row, mirror),
    runtimes: { node: process.execPath, python: findPython },
    environment: { ...environment, AMBITIOUS_HOME: home },
    ...(runtimeModule === null ? {} : { pinnedRuntime: { module: runtimeModule, runTool: systemTool } }),
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

const ownSkills = (): readonly TemplateSkill[] => withInstallerPin(parseTemplateSkills(embeddedSkills()), sha256Of(readFileSync(fileURLToPath(import.meta.url))));

const skillFilesData = (environment: Environment): JsonObject => {
  const home = ambitiousHome(environment);
  return { home, directory: skillsDirectory(home), skills: placeSkillFiles(home, ownSkills()) };
};

const skillsData = ({ inFile }: Wanted): JsonObject => {
  const requests = parseSkillOffers(jsonFrom(inFile ?? STDIN, inFile === null ? "The input on stdin" : `The input file ${inFile}`, "Pass the list of skills as JSON on stdin or with --in."));
  const offers = withTemplateBodies(requests, new Map(ownSkills().map(({ name, body }) => [name, body])));
  const decisions = offers.map(decideSkillWrite);
  const skills = decisions.map((decision, index) => {
    const offer = offers[index];
    return { ...decision, storedSha256: offer?.stored == null ? null : sha256Of(offer.stored), candidateSha256: offer === undefined ? null : sha256Of(offer.candidate) };
  });
  return {
    skills,
    changes: decisions.flatMap((decision) => skillChange(decision) ?? []),
    tellOwner: decisions.flatMap(({ tellOwner }) => (tellOwner === null ? [] : [tellOwner])),
  };
};

const connectionData = ({ inFile }: Wanted): JsonObject => ({
  ...identifyConnection(parseConnectorOffers(jsonFrom(inFile ?? STDIN, inFile === null ? "The input on stdin" : `The input file ${inFile}`, "Pass the list of connectors as JSON on stdin or with --in."))),
});

const guideData = ({ topic }: Wanted, environment: Environment): JsonObject => {
  const guides = parseGuides(embeddedGuides());
  if (topic === null) return { guides: guides.map((guide) => ({ topic: guide.topic, title: guide.title, bytes: Buffer.byteLength(guide.text, "utf8") })) };
  const guide = guideFor(guides, topic);
  return { topic: guide.topic, title: guide.title, path: placeGuideFile(ambitiousHome(environment), guide), text: guide.text };
};

const reviewPageData = ({ inFile, built }: Wanted, environment: Environment): JsonObject => ({
  ...reviewPage({
    home: ambitiousHome(environment),
    now: new Date(),
    built,
    highPriority: inFile === null ? null : parseHighPriority(jsonFrom(inFile, `The input file ${inFile}`, "Name a JSON file that lists the ids of the high-priority findings, outside the bot's private data directory.")),
  }),
});

const dataFor = async (request: Wanted, version: string, environment: Environment): Promise<JsonObject> => {
  if (request.command === "sync") return syncData(request, version, environment);
  if (request.command === "skill-files") return skillFilesData(environment);
  if (request.command === "guide") return guideData(request, environment);
  if (request.command === "review-page") return reviewPageData(request, environment);
  if (request.command === "self-update") return { ...await selfUpdate({ home: ambitiousHome(environment), runningVersion: version, version: request.version, sha256: request.sha256 }) };
  if (request.command === "instructions-merge") return { ...mergeInstructions(request.currentFile, request.publishedFile, request.publishedSha256, parseInstructionsCatalogue(embeddedInstructions())) };
  return request.command === "skills" ? skillsData(request) : connectionData(request);
};

const run = async (argv: readonly string[], environment: Environment): Promise<{ readonly stdout: string; readonly exitCode: number }> => {
  const { version } = embedded();
  const identity: Identity = { schemaVersion: 1, module: INSTALLER_MODULE, command: commandGiven(argv), meta: { now: new Date().toISOString(), seed: 0, version } };
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
