import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isModuleName, isSemver } from "../domain/envelope.ts";
import { failure } from "../domain/failure.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";

export type AssetKind = "mjs" | "pyz";

export type Download = (fileName: string) => Promise<Uint8Array>;

export type InstallRequest = {
  readonly module: string;
  readonly version: string;
  readonly kind: AssetKind;
  readonly home: string;
  readonly download: Download;
  readonly pinned?: string;
};

export type InstallAction = "installed" | "replaced" | "relinked" | "unchanged";

export type InstallOutcome = {
  readonly action: InstallAction;
  readonly asset: string;
  readonly path: string;
  readonly link: string;
  readonly sha256: string;
};

export const SUMS_FILE = "SHA256SUMS";

const SUMS_LINE = /^([0-9a-f]{64}) [ *](\S+)$/;

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

export const parseSums = (text: string): ReadonlyMap<string, string> =>
  new Map(
    text.split("\n").flatMap((line) => {
      const [, hash, name] = SUMS_LINE.exec(line) ?? [];
      return hash === undefined || name === undefined ? [] : [[name, hash] as const];
    }),
  );

const formatSums = (sums: ReadonlyMap<string, string>): string =>
  [...sums]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, hash]) => `${hash}  ${name}\n`)
    .join("");

const readIfPresent = (path: string): Buffer | null => {
  try {
    return readFileSync(path);
  } catch {
    return null;
  }
};

export const currentLink = (path: string): string | null =>
  lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true ? readlinkSync(path) : null;

const placeByRename = (directory: string, name: string, write: (temporary: string) => void): void => {
  const temporary = join(directory, `.${name}.${process.pid}.partial`);
  try {
    write(temporary);
    renameSync(temporary, join(directory, name));
  } finally {
    rmSync(temporary, { force: true });
  }
};

const fetched = async (download: Download, fileName: string): Promise<Uint8Array> => {
  try {
    return await download(fileName);
  } catch (error) {
    throw failure(
      "E_INSTALL_DOWNLOAD",
      `${fileName} could not be downloaded: ${error instanceof Error ? error.message : String(error)}.`,
      "Check the release address and the network, then run the installer again. The existing install was left as it was.",
    );
  }
};

export const pointLink = (bin: string, linkName: string, asset: string): void =>
  placeByRename(bin, linkName, (temporary) => symlinkSync(asset, temporary));

export const install = async ({ module, version, kind, home, download, pinned }: InstallRequest): Promise<InstallOutcome> => {
  if (!isModuleName(module)) throw failure("E_USAGE", `"${module}" is not a module name.`, "Use the lower-case name after ambitious-, for example tasks.");
  if (!isSemver(version)) {
    throw failure("E_USAGE", `"${version}" is not an exact version.`, "Name one exact semantic version, for example 0.3.1. The installer never resolves \"latest\".");
  }
  const bin = join(refuseAgentData(home), "bin");
  const asset = `ambitious-${module}-${version}.${kind}`;
  const linkName = `ambitious-${module}`;
  const path = join(bin, asset);
  const link = join(bin, linkName);
  const outcome = (action: InstallAction, hash: string): InstallOutcome => ({ action, asset, path, link, sha256: hash });
  const switchLink = (): void => pointLink(bin, linkName, asset);

  const installedSums = parseSums(readIfPresent(join(bin, SUMS_FILE))?.toString("utf8") ?? "");
  const recorded = installedSums.get(asset);
  const present = readIfPresent(path);
  if (present !== null && recorded !== undefined && sha256(present) === recorded && (pinned === undefined || pinned === recorded)) {
    if (currentLink(link) === asset) return outcome("unchanged", recorded);
    switchLink();
    return outcome("relinked", recorded);
  }

  const expected = parseSums(new TextDecoder().decode(await fetched(download, SUMS_FILE))).get(asset);
  if (expected === undefined) {
    throw failure(
      "E_INSTALL_CHECKSUM",
      `The release's ${SUMS_FILE} has no line for ${asset}.`,
      "Check the module name, version and release address. The existing install was left as it was.",
    );
  }
  if (pinned !== undefined && expected !== pinned) {
    throw failure(
      "E_INSTALL_CHECKSUM",
      `The release's ${SUMS_FILE} lists SHA-256 ${expected} for ${asset}, but the pinned checksum is ${pinned}.`,
      "The release and the pin disagree, so nothing was installed. Report it; do not edit the pin. The existing install was left as it was.",
    );
  }
  const bytes = await fetched(download, asset);
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw failure(
      "E_INSTALL_CHECKSUM",
      `The downloaded ${asset} has SHA-256 ${actual}, but ${SUMS_FILE} lists ${expected}.`,
      "Run the installer again. If it keeps failing, the release is damaged. The existing install was left as it was.",
    );
  }
  mkdirSync(bin, { recursive: true });
  placeByRename(bin, asset, (temporary) => {
    writeFileSync(temporary, bytes);
    chmodSync(temporary, 0o755);
  });
  placeByRename(bin, SUMS_FILE, (temporary) => writeFileSync(temporary, formatSums(new Map([...installedSums, [asset, expected]]))));
  switchLink();
  return outcome(present === null ? "installed" : "replaced", expected);
};
