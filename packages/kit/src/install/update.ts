import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { Failure } from "../domain/failure.ts";
import { isRecord } from "../domain/json.ts";
import { isNewerVersion } from "../domain/lock.ts";
import { currentLink, install, pointLink } from "./install.ts";
import { INSTALLER_MODULE, kitRelease, latestInstallerVersion, networkFetchers, releaseDownload, type Fetchers } from "./release.ts";

export type UpdateRequest = {
  readonly own: string;
  readonly home: string;
  readonly mirror: string | null;
  readonly node: string;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly fetchers?: Fetchers;
};

export type UpdateOutcome =
  | { readonly kind: "current" }
  | { readonly kind: "handedOver"; readonly stdout: string; readonly status: number }
  | { readonly kind: "unchecked"; readonly problem: string };

const HANDOVER_TIMEOUT_MS = 900_000;
const LINK = `ambitious-${INSTALLER_MODULE}`;

const reason = (error: unknown): string =>
  error instanceof Failure ? error.errors.map(({ message }) => message).join(" ") : error instanceof Error ? error.message : String(error);

const answersAsInstaller = (stdout: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return isRecord(parsed) && parsed.module === INSTALLER_MODULE && typeof parsed.ok === "boolean";
  } catch {
    return false;
  }
};

export const updateInstaller = async ({ own, home, mirror, node, environment, fetchers = networkFetchers }: UpdateRequest): Promise<UpdateOutcome> => {
  const keptPins = "The pins that came with this installer were used.";
  const latest = await latestInstallerVersion(mirror, fetchers).catch((error: unknown) => new Error(reason(error)));
  if (latest instanceof Error) return { kind: "unchecked", problem: `Could not check for a newer template release: ${latest.message}. ${keptPins}` };
  if (latest === null || !isNewerVersion(latest, own)) return { kind: "current" };
  const bin = join(home, "bin");
  const previous = currentLink(join(bin, LINK));
  try {
    const { path } = await install({ module: INSTALLER_MODULE, version: latest, kind: "mjs", home, download: releaseDownload(kitRelease(latest), mirror, fetchers) });
    const handover = spawnSync(node, [path, "sync", "--json", "--updated-from", own, ...(mirror === null ? [] : ["--from", mirror])], {
      encoding: "utf8",
      timeout: HANDOVER_TIMEOUT_MS,
      env: { ...environment },
    });
    if (answersAsInstaller(handover.stdout)) return { kind: "handedOver", stdout: handover.stdout, status: handover.status ?? 2 };
    if (previous === null) rmSync(join(bin, LINK), { force: true });
    else pointLink(bin, LINK, previous);
    return { kind: "unchecked", problem: `The newer template release ${latest} did not run correctly, so it was set aside. ${keptPins}` };
  } catch (error) {
    return { kind: "unchecked", problem: `The newer template release ${latest} could not be installed: ${reason(error)} ${keptPins}` };
  }
};
