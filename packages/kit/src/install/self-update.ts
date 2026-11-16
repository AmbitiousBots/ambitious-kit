import { lstatSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { failure } from "../domain/failure.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";
import { currentLink, install, SUMS_FILE, type InstallOutcome } from "./install.ts";
import { INSTALLER_MODULE, KIT_REPOSITORY, networkFetchers, releaseDownload, type Fetchers } from "./release.ts";
import { sha256Of } from "./text-file.ts";

export type SelfUpdateRequest = {
  readonly home: string;
  readonly runningVersion: string;
  readonly version: string;
  readonly sha256: string;
};

export type SelfUpdateOutcome = InstallOutcome & { readonly version: string; readonly previousVersion: string };

const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const HASH = /^[0-9a-f]{64}$/;
const LINK = /^ambitious-modules-((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))\.mjs$/;

const newer = (candidate: string, current: string): boolean => {
  const parts = current.split(".").map(BigInt);
  for (const [index, part] of candidate.split(".").map(BigInt).entries()) {
    const other = parts[index] ?? 0n;
    if (part !== other) return part > other;
  }
  return false;
};

const installedVersion = (link: string, runningVersion: string): string => {
  const target = currentLink(link);
  if (target === null && lstatSync(link, { throwIfNoEntry: false }) === undefined) return runningVersion;
  const version = LINK.exec(target ?? "")?.[1];
  if (version === undefined) {
    throw failure("E_INSTALL_VERSION", "The installed ambitious-modules link does not name a versioned installer.", "Restore the link from the stored installer skill before trying a self-update. No file or link was replaced.");
  }
  return newer(version, runningVersion) ? version : runningVersion;
};

const preventDowngrade = (version: string, link: string, runningVersion: string): string => {
  const current = installedVersion(link, runningVersion);
  if (newer(current, version)) {
    throw failure("E_INSTALL_DOWNGRADE", `Installer ${version} is older than the running or installed version ${current}.`, "Use the current version or a newer release from the authenticated connection. The existing install was left as it was.");
  }
  return current;
};

const checksumFailure = (message: string): never => {
  throw failure("E_INSTALL_CHECKSUM", message, "The service checksum, the release's SHA256SUMS and the installer bytes must agree. Nothing was switched; report the disagreement and do not change the checksum.");
};

const releaseBytes = async (download: ReturnType<typeof releaseDownload>, file: string): Promise<Uint8Array> => {
  try {
    return await download(file);
  } catch (error) {
    throw failure("E_INSTALL_DOWNLOAD", `${file} could not be downloaded: ${error instanceof Error ? error.message : String(error)}.`, "Check access to the public kit release and retry. The existing installer was left as it was.");
  }
};

const acquire = (path: string): void => {
  try {
    mkdirSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw failure("E_INSTALL_BUSY", "Another installer self-update holds the update lock.", "Wait for that update to finish and retry. If it was interrupted, have the owner remove bin/.ambitious-modules-update.lock after confirming no update is running.");
    }
    throw error;
  }
};

export const selfUpdate = async ({ home, runningVersion, version, sha256 }: SelfUpdateRequest, fetchers: Fetchers = networkFetchers): Promise<SelfUpdateOutcome> => {
  if (!VERSION.test(version) || !VERSION.test(runningVersion)) {
    throw failure("E_USAGE", "A self-update needs an exact stable kit version, such as 0.3.0.", "Use the numeric kit.version from check_updates; never use latest, an address, or a prerelease.");
  }
  if (!HASH.test(sha256)) throw failure("E_USAGE", "The service checksum must be 64 lowercase hexadecimal characters.", "Pass kit.installer.sha256 from check_updates over the authenticated, identity-confirmed Ambitious connection.");
  const root = refuseAgentData(home);
  const bin = refuseAgentData(join(root, "bin"));
  const asset = `ambitious-${INSTALLER_MODULE}-${version}.mjs`;
  const path = refuseAgentData(join(bin, asset));
  const link = refuseAgentData(join(bin, `ambitious-${INSTALLER_MODULE}`));
  refuseAgentData(join(bin, SUMS_FILE));
  preventDowngrade(version, link, runningVersion);
  mkdirSync(bin, { recursive: true });
  const lock = refuseAgentData(join(bin, ".ambitious-modules-update.lock"));
  acquire(lock);
  try {
    const previousVersion = preventDowngrade(version, link, runningVersion);
    const tag = `kit-v${version}`;
    const download = releaseDownload({ release: `https://github.com/${KIT_REPOSITORY}/releases/download/${tag}`, tag }, null, fetchers);
    const sums = await releaseBytes(download, SUMS_FILE);
    const matches = new TextDecoder().decode(sums).split("\n").filter((line) => line.slice(66) === asset);
    if (matches.length !== 1 || matches[0] !== `${sha256}  ${asset}` && matches[0] !== `${sha256} *${asset}`) {
      checksumFailure(`The release's ${SUMS_FILE} must contain exactly one matching checksum for ${asset}.`);
    }
    const bytes = await releaseBytes(download, asset);
    if (sha256Of(bytes) !== sha256) checksumFailure(`The downloaded ${asset} does not match the service checksum.`);
    preventDowngrade(version, link, runningVersion);
    if (lstatSync(path, { throwIfNoEntry: false }) !== undefined && sha256Of(readFileSync(path)) !== sha256) {
      checksumFailure(`The existing ${asset} has different bytes and was kept.`);
    }
    const outcome = await install({ module: INSTALLER_MODULE, version, kind: "mjs", home: root, pinned: sha256, download: (file) => Promise.resolve(file === SUMS_FILE ? sums : bytes) });
    return { ...outcome, version, previousVersion };
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
};
