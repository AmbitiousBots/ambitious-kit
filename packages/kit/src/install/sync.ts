import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { envelopeProblems } from "../domain/envelope.ts";
import { Failure } from "../domain/failure.ts";
import { isRecord } from "../domain/json.ts";
import type { LockRow } from "../domain/lock.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";
import { currentLink, install, parseSums, SUMS_FILE, type Download } from "./install.ts";

export type ModuleState = "installed" | "unchanged" | "reinstalled" | "upgraded" | "failed";

export type SelfcheckState = "ok" | "problems" | "not run";

export type ModuleReport = {
  readonly module: string;
  readonly version: string;
  readonly state: ModuleState;
  readonly selfcheck: SelfcheckState;
  readonly problems: readonly string[];
};

export type Runtimes = {
  readonly node: string;
  readonly python: () => string | null;
};

export type SyncRequest = {
  readonly rows: readonly LockRow[];
  readonly home: string;
  readonly sourceFor: (row: LockRow) => Download;
  readonly runtimes: Runtimes;
  readonly environment: Readonly<Record<string, string | undefined>>;
};

const SELFCHECK_TIMEOUT_MS = 120_000;
const PYTHON_PROBE_TIMEOUT_MS = 20_000;
const REQUIRED_PYTHON = "3.13";

export const findPython = (): string | null =>
  ["python3.13", "python3"].find((candidate) => {
    const probe = spawnSync(candidate, ["-c", "import sys; print('%d.%d' % sys.version_info[:2])"], { encoding: "utf8", timeout: PYTHON_PROBE_TIMEOUT_MS });
    return probe.status === 0 && probe.stdout.trim() === REQUIRED_PYTHON;
  }) ?? null;

const sha256OfFile = (path: string): string | null => {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
};

const recordedSums = (bin: string): ReadonlyMap<string, string> => {
  try {
    return parseSums(readFileSync(join(bin, SUMS_FILE), "utf8"));
  } catch {
    return new Map();
  }
};

const changeOf = (row: LockRow, bin: string): Exclude<ModuleState, "unchanged" | "failed"> => {
  const linked = currentLink(join(bin, `ambitious-${row.module}`));
  const present = sha256OfFile(join(bin, row.asset));
  const recorded = recordedSums(bin).get(row.asset);
  if (linked !== null && linked !== row.asset && linked.startsWith(`ambitious-${row.module}-`)) return "upgraded";
  if (present !== null && present === recorded && recorded !== row.sha256) return "upgraded";
  if (linked === null && present === null && recorded === undefined) return "installed";
  return "reinstalled";
};

const texts = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.map((entry: unknown) => (typeof entry === "string" ? entry : JSON.stringify(entry))) : [];

const errorTexts = (value: unknown): readonly string[] =>
  Array.isArray(value)
    ? value.flatMap((entry: unknown) => (isRecord(entry) && typeof entry.message === "string" ? [`${entry.message}${typeof entry.hint === "string" ? ` ${entry.hint}` : ""}`] : []))
    : [];

const selfcheckProblems = (row: LockRow, link: string, runtime: string, environment: Readonly<Record<string, string | undefined>>): readonly string[] => {
  const run = spawnSync(runtime, [link, "selfcheck", "--json"], { encoding: "utf8", timeout: SELFCHECK_TIMEOUT_MS, env: { ...environment } });
  if (run.error !== undefined) return [`The selfcheck could not start: ${run.error.message}.`];
  const parsed = ((): unknown => {
    try {
      return JSON.parse(run.stdout);
    } catch {
      return null;
    }
  })();
  if (!isRecord(parsed) || envelopeProblems(parsed).length > 0) return [`The selfcheck did not print a result this installer can read (exit code ${run.status ?? "none"}).`];
  const data = isRecord(parsed.data) ? parsed.data : {};
  const reportedSha = isRecord(data.binary) ? data.binary.sha256 : undefined;
  return [
    ...errorTexts(parsed.errors),
    ...texts(data.problems),
    ...(parsed.module === row.module ? [] : [`The binary answers as the module "${String(parsed.module)}", not "${row.module}".`]),
    ...(parsed.ok !== true || reportedSha === row.sha256 ? [] : ["The binary reports a different checksum from the pinned one."]),
    ...(parsed.ok === true || errorTexts(parsed.errors).length > 0 ? [] : ["The selfcheck failed without saying why."]),
  ];
};

const checked = (row: LockRow, state: ModuleState, link: string, { runtimes, environment }: SyncRequest): ModuleReport => {
  const runtime = row.kind === "pyz" ? runtimes.python() : runtimes.node;
  const base = { module: row.module, version: row.version, state };
  if (runtime === null) {
    return { ...base, selfcheck: "not run", problems: [`Python ${REQUIRED_PYTHON} was not found on this computer. The module is installed but cannot run until Python ${REQUIRED_PYTHON} is available.`] };
  }
  const problems = selfcheckProblems(row, link, runtime, environment);
  return { ...base, selfcheck: problems.length === 0 ? "ok" : "problems", problems };
};

const syncModule = async (row: LockRow, request: SyncRequest): Promise<ModuleReport> => {
  const bin = join(request.home, "bin");
  const change = changeOf(row, bin);
  try {
    const outcome = await install({ module: row.module, version: row.version, kind: row.kind, home: request.home, download: request.sourceFor(row), pinned: row.sha256 });
    return checked(row, outcome.action === "unchanged" ? "unchanged" : change, outcome.link, request);
  } catch (error) {
    if (!(error instanceof Failure)) throw error;
    return { module: row.module, version: row.version, state: "failed", selfcheck: "not run", problems: error.errors.map(({ message, hint }) => `${message} ${hint}`) };
  }
};

export const sync = async (request: SyncRequest): Promise<readonly ModuleReport[]> => {
  refuseAgentData(request.home);
  const reports: ModuleReport[] = [];
  for (const row of request.rows) reports.push(await syncModule(row, request));
  return reports;
};

const STATE_ORDER: readonly ModuleState[] = ["installed", "upgraded", "reinstalled", "unchanged", "failed"];

export const summaryOf = (reports: readonly ModuleReport[], otherProblems: number): string => {
  if (reports.length === 0) return "No modules are pinned, so nothing was installed or checked.";
  const counts = STATE_ORDER.flatMap((state) => {
    const count = reports.filter((report) => report.state === state).length;
    return count === 0 ? [] : [`${count} ${state}`];
  });
  const troubled = reports.filter((report) => report.problems.length > 0).map((report) => `ambitious-${report.module}`);
  const modules = `${reports.length} ${reports.length === 1 ? "module" : "modules"} checked: ${counts.join(", ")}.`;
  if (troubled.length === 0 && otherProblems === 0) return `${modules} Every selfcheck is ok.`;
  return `${modules} ${troubled.length === 0 ? "Every selfcheck is ok, but there is a problem to report" : `Problems with ${troubled.join(", ")}`}; read data.problems.`;
};
