import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isModuleName, isSemver } from "../domain/envelope.ts";
import { failure } from "../domain/failure.ts";
import { isRecord } from "../domain/json.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";
import { parseSums, placeByRename, refuseNonRegularFile, SUMS_FILE, type Download } from "./install.ts";

export type RunTool = (program: string, args: readonly string[]) => Promise<void>;

export type RuntimeRequest = {
  readonly module: string;
  readonly version: string;
  readonly home: string;
  readonly download: Download;
  readonly runTool: RunTool;
  readonly python?: string;
};

export type RuntimeAction = "installed" | "unchanged";

export type RuntimeOutcome = {
  readonly action: RuntimeAction;
  readonly lock: string;
  readonly lockSha256: string;
  readonly path: string;
};

export const RUNTIME_MARKER = "ambitious-runtime.json";
export const RUNTIME_LOCK = "requirements.txt";

const HASHED_PIN = /^[A-Za-z0-9][A-Za-z0-9._-]*==[A-Za-z0-9.!+_-]+(?:\s+--hash=sha256:[0-9a-f]{64})+$/;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export const runtimeLockAsset = (module: string, version: string): string => `ambitious-${module}-${version}.runtime.txt`;

export const runtimeLockProblems = (text: string): readonly string[] => {
  const pins = text
    .replace(/\\\n/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  const loose = pins.filter((line) => !HASHED_PIN.test(line));
  return [
    ...(pins.length === 0 ? ["The runtime lock lists no package."] : []),
    ...loose.map((line) => `The runtime lock line "${line.slice(0, 80)}" is not one exact version with at least one --hash=sha256: value.`),
  ];
};

const markerMatches = (directory: string, lockSha256: string): boolean => {
  try {
    const marker: unknown = JSON.parse(readFileSync(join(directory, RUNTIME_MARKER), "utf8"));
    return isRecord(marker) && marker.lockSha256 === lockSha256;
  } catch {
    return false;
  }
};

const fetched = async (download: Download, fileName: string): Promise<Uint8Array> => {
  try {
    return await download(fileName);
  } catch (error) {
    throw failure(
      "E_INSTALL_DOWNLOAD",
      `${fileName} could not be downloaded: ${error instanceof Error ? error.message : String(error)}.`,
      "Check the release address and the network, then run the installer again. No runtime was put in place.",
    );
  }
};

export const systemTool: RunTool = (program, args) =>
  new Promise((resolve, reject) => {
    execFile(program, [...args], { maxBuffer: 64 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error === null) resolve();
      else reject(new Error(String(stderr).trim().split("\n").slice(-3).join(" ") || error.message));
    });
  });

export const installRuntime = async ({ module, version, home, download, runTool, python = "python3" }: RuntimeRequest): Promise<RuntimeOutcome> => {
  if (!isModuleName(module)) throw failure("E_USAGE", `"${module}" is not a module name.`, "Use the lower-case name after ambitious-, for example tasks.");
  if (!isSemver(version)) throw failure("E_USAGE", `"${version}" is not an exact version.`, "Name one exact semantic version, for example 0.3.1.");
  const root = refuseAgentData(home);
  const bin = join(root, "bin");
  const runtimes = join(root, module, "runtime");
  const lock = runtimeLockAsset(module, version);
  const outcome = (action: RuntimeAction, lockSha256: string): RuntimeOutcome => ({ action, lock, lockSha256, path: join(runtimes, lockSha256) });

  refuseNonRegularFile(join(bin, SUMS_FILE));
  const installedSums = parseSums(existsSync(join(bin, SUMS_FILE)) ? readFileSync(join(bin, SUMS_FILE), "utf8") : "");
  const recorded = installedSums.get(lock);
  if (recorded !== undefined && markerMatches(join(runtimes, recorded), recorded)) return outcome("unchanged", recorded);

  const expected = parseSums(new TextDecoder().decode(await fetched(download, SUMS_FILE))).get(lock);
  if (expected === undefined) {
    throw failure(
      "E_INSTALL_CHECKSUM",
      `The release's ${SUMS_FILE} has no line for ${lock}.`,
      "This release declares no pinned runtime, or the module name or version is wrong. Run the installer without --runtime, or check the release.",
    );
  }
  const bytes = await fetched(download, lock);
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw failure(
      "E_INSTALL_CHECKSUM",
      `The downloaded ${lock} has SHA-256 ${actual}, but ${SUMS_FILE} lists ${expected}.`,
      "Run the installer again. If it keeps failing, the release is damaged. No runtime was put in place.",
    );
  }
  const text = new TextDecoder().decode(bytes);
  const loose = runtimeLockProblems(text);
  if (loose.length > 0) {
    throw failure("E_INSTALL_RUNTIME", loose.join(" "), "The release's runtime lock must pin every package to one version with its SHA-256. Report it; nothing was installed.");
  }
  const final = join(runtimes, expected);
  const record = (): void => {
    mkdirSync(bin, { recursive: true });
    const lines = [...new Map([...installedSums, [lock, expected]])].sort(([a], [b]) => (a < b ? -1 : 1));
    placeByRename(bin, SUMS_FILE, (descriptor) => writeFileSync(descriptor, lines.map(([name, hash]) => `${hash}  ${name}\n`).join("")));
  };
  if (markerMatches(final, expected)) {
    record();
    return outcome("unchanged", expected);
  }
  mkdirSync(runtimes, { recursive: true });
  const staging = join(runtimes, `.${expected}.${randomBytes(8).toString("hex")}.partial`);
  try {
    try {
      await runTool(python, ["-m", "venv", staging]);
      writeFileSync(join(staging, RUNTIME_LOCK), bytes);
      await runTool(join(staging, "bin", "python"), [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-input",
        "--no-deps",
        "--require-hashes",
        "--only-binary",
        ":all:",
        "--requirement",
        join(staging, RUNTIME_LOCK),
      ]);
    } catch (error) {
      throw failure(
        "E_INSTALL_RUNTIME",
        `The pinned runtime for ${module} ${version} could not be built: ${error instanceof Error ? error.message : String(error)}.`,
        "Check that python3 can create a virtual environment (python3 -m venv) and that the package index can be reached, then run the installer again. No runtime was put in place.",
      );
    }
    writeFileSync(join(staging, RUNTIME_MARKER), `${JSON.stringify({ module, version, lockSha256: expected })}\n`);
    rmSync(final, { recursive: true, force: true });
    renameSync(staging, final);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  record();
  return outcome("installed", expected);
};
