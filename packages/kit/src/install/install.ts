import { createHash, randomBytes } from "node:crypto";
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

const unsafeFile = (path: string): never => {
  throw failure("E_INSTALL_PATH", `The install target ${path} is not a regular file.`, "Remove the symlink or non-regular target after checking it with the owner, then retry. No link was activated through it.");
};

export const refuseNonRegularFile = (path: string): void => {
  const present = lstatSync(path, { throwIfNoEntry: false });
  if (present !== undefined && !present.isFile()) unsafeFile(path);
};

const readIfPresent = (path: string): Buffer | null => {
  refuseNonRegularFile(path);
  if (lstatSync(path, { throwIfNoEntry: false }) === undefined) return null;
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!fstatSync(descriptor).isFile()) unsafeFile(path);
    return readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
};

export const currentLink = (path: string): string | null =>
  lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true ? readlinkSync(path) : null;

const temporaryPath = (directory: string, name: string): string => join(directory, `.${name}.${randomBytes(16).toString("hex")}.partial`);

export const placeByRename = (directory: string, name: string, write: (descriptor: number) => void): void => {
  const target = join(directory, name);
  refuseNonRegularFile(target);
  const temporary = temporaryPath(directory, name);
  const descriptor = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
  try {
    write(descriptor);
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    const staged = lstatSync(temporary);
    if (!staged.isFile() || staged.dev !== written.dev || staged.ino !== written.ino) unsafeFile(temporary);
    refuseNonRegularFile(target);
    renameSync(temporary, target);
  } finally {
    closeSync(descriptor);
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

export const pointLink = (bin: string, linkName: string, asset: string): void => {
  const path = join(bin, asset);
  if (lstatSync(path, { throwIfNoEntry: false })?.isFile() !== true) unsafeFile(path);
  const temporary = temporaryPath(bin, linkName);
  symlinkSync(asset, temporary);
  try {
    if (lstatSync(path, { throwIfNoEntry: false })?.isFile() !== true) unsafeFile(path);
    renameSync(temporary, join(bin, linkName));
  } finally {
    rmSync(temporary, { force: true });
  }
};

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
  refuseNonRegularFile(path);
  refuseNonRegularFile(join(bin, SUMS_FILE));
  placeByRename(bin, asset, (descriptor) => {
    writeFileSync(descriptor, bytes);
    fchmodSync(descriptor, 0o755);
  });
  placeByRename(bin, SUMS_FILE, (descriptor) => writeFileSync(descriptor, formatSums(new Map([...installedSums, [asset, expected]]))));
  switchLink();
  return outcome(present === null ? "installed" : "replaced", expected);
};
