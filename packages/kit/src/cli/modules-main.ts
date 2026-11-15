import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { envelope, exitCodeOf, serialize, type ErrorEntry, type Identity } from "../domain/envelope.ts";
import { Failure, failure } from "../domain/failure.ts";
import type { JsonObject } from "../domain/json.ts";
import { parseLock, type LockRow } from "../domain/lock.ts";
import { INSTALLER_MODULE, releaseDownload } from "../install/release.ts";
import { findPython, summaryOf, sync } from "../install/sync.ts";
import { updateInstaller } from "../install/update.ts";
import { ambitiousHome, refuseAgentData } from "../paths/refuse-agent-data.ts";
import { embedded, embeddedLock } from "./embedded.ts";

const USAGE = "ambitious-modules sync [--json] [--from <mirror directory>] [--lock <lock file>]";

type Wanted = { readonly mirror: string | null; readonly lockFile: string | null; readonly updatedFrom: string | null };

type Printed = { readonly stdout: string; readonly exitCode: number };

type Environment = Readonly<Record<string, string | undefined>>;

const wanted = (argv: readonly string[], environment: Environment): Wanted => {
  const wrong = (message: string): Failure => failure("E_USAGE", message, `Run it as: ${USAGE}`);
  const { positionals, values } = (() => {
    try {
      return parseArgs({
        args: [...argv],
        allowPositionals: true,
        options: { from: { type: "string" }, lock: { type: "string" }, "updated-from": { type: "string" }, json: { type: "boolean" } },
      });
    } catch (error) {
      throw wrong(error instanceof Error ? `${error.message}.` : "The arguments could not be read.");
    }
  })();
  if (positionals.length !== 1 || positionals[0] !== "sync") throw wrong("The only command is sync.");
  const mirror = values.from ?? environment.AMBITIOUS_MODULE_MIRROR ?? "";
  return { mirror: mirror === "" ? null : mirror, lockFile: values.lock ?? null, updatedFrom: values["updated-from"] ?? null };
};

const lockFrom = (file: string): readonly LockRow[] => {
  const path = refuseAgentData(file);
  const parsed = ((): unknown => {
    try {
      return JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      throw failure("E_INPUT_SCHEMA", `The lock file ${file} could not be read as JSON: ${error instanceof Error ? error.message : String(error)}.`, "Name a JSON lock file, or leave --lock out to use the pins that came with this installer.");
    }
  })();
  return parseLock(parsed);
};

const run = async (argv: readonly string[], environment: Environment): Promise<Printed> => {
  const { version } = embedded();
  const identity: Identity = { schemaVersion: 1, module: INSTALLER_MODULE, command: "sync", meta: { now: new Date().toISOString(), seed: 0, version } };
  const printed = (result: ReturnType<typeof envelope.ok> | ReturnType<typeof envelope.err>): Printed => ({ stdout: serialize(result), exitCode: exitCodeOf(result) });
  try {
    const { mirror, lockFile, updatedFrom } = wanted(argv, environment);
    const home = ambitiousHome(environment);
    const rows = lockFile === null ? parseLock(embeddedLock()) : lockFrom(lockFile);
    const node = process.execPath;
    const selfcheckEnvironment = { ...environment, AMBITIOUS_HOME: home };
    const update = await (async (): Promise<{ readonly template: JsonObject; readonly problems: readonly string[] } | Printed> => {
      if (lockFile !== null) return { template: { version, update: "not checked", why: "A lock file was named, so its pins were used as given." }, problems: [] };
      if (updatedFrom !== null) return { template: { version, update: "updated", from: updatedFrom }, problems: [] };
      const outcome = await updateInstaller({ own: version, home, mirror, node, environment: selfcheckEnvironment });
      if (outcome.kind === "handedOver") return { stdout: outcome.stdout, exitCode: outcome.status };
      if (outcome.kind === "unchecked") return { template: { version, update: "not checked", why: outcome.problem }, problems: [outcome.problem] };
      return { template: { version, update: "current" }, problems: [] };
    })();
    if ("stdout" in update) return update;
    const reports = await sync({
      rows,
      home,
      sourceFor: (row) => releaseDownload(row, mirror),
      runtimes: { node, python: findPython },
      environment: selfcheckEnvironment,
    });
    const problems = [...update.problems, ...reports.flatMap((report) => report.problems.map((problem) => `ambitious-${report.module}: ${problem}`))];
    return printed(
      envelope.ok(identity, {
        home,
        bin: join(home, "bin"),
        source: mirror === null ? "the release addresses in the lock" : `the mirror directory ${mirror}`,
        template: update.template,
        modules: reports,
        problems,
        summary: summaryOf(reports, update.problems.length),
      }),
    );
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
