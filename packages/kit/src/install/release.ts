import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isNewerVersion } from "../domain/lock.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";
import type { Download } from "./install.ts";

export type ReleaseAddress = { readonly release: string; readonly tag: string };

export type Fetchers = {
  readonly web: (url: string) => Promise<Uint8Array>;
  readonly gh: (args: readonly string[]) => Promise<Uint8Array>;
  readonly webLatestTag: (repository: string) => Promise<string>;
};

export const KIT_REPOSITORY = "AmbitiousBots/ambitious-kit";
export const INSTALLER_MODULE = "modules";

const GITHUB_RELEASE = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/[^/]+$/;
const KIT_TAG = /^kit-v((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))$/;
const GH_MAX_BYTES = 512 * 1024 * 1024;

export const kitRelease = (version: string): ReleaseAddress => ({
  release: `https://github.com/${KIT_REPOSITORY}/releases/download/kit-v${version}`,
  tag: `kit-v${version}`,
});

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const networkFetchers: Fetchers = {
  web: async (url) => {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) throw new Error(`the server answered ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  },
  gh: (args) =>
    new Promise((resolve, reject) => {
      execFile("gh", [...args], { encoding: "buffer", maxBuffer: GH_MAX_BYTES }, (error, stdout) => {
        if (error === null) resolve(new Uint8Array(stdout));
        else reject(new Error("code" in error && error.code === "ENOENT" ? "the GitHub CLI (gh) is not installed" : "the GitHub CLI (gh) is not signed in or could not reach the release"));
      });
    }),
  webLatestTag: async (repository) => {
    const response = await fetch(`https://github.com/${repository}/releases/latest`, { redirect: "manual" });
    const tag = /\/releases\/tag\/([^/?#]+)$/.exec(response.headers.get("location") ?? "")?.[1];
    if (tag === undefined) throw new Error(`the server answered ${response.status}`);
    return decodeURIComponent(tag);
  },
};

const viaWebThenGh = async (web: () => Promise<Uint8Array>, gh: () => Promise<Uint8Array>): Promise<Uint8Array> => {
  try {
    return await web();
  } catch (webError) {
    try {
      return await gh();
    } catch (ghError) {
      throw new Error(`${reason(webError)}, and ${reason(ghError)}`, { cause: ghError });
    }
  }
};

export const releaseDownload = ({ release, tag }: ReleaseAddress, mirror: string | null, fetchers: Fetchers = networkFetchers): Download => {
  if (mirror !== null) {
    const directory = join(refuseAgentData(mirror), tag);
    return (fileName) => readFile(join(directory, fileName));
  }
  const repository = GITHUB_RELEASE.exec(release)?.[1];
  return (fileName) => {
    const web = (): Promise<Uint8Array> => fetchers.web(`${release}/${fileName}`);
    if (repository === undefined) return web();
    return viaWebThenGh(web, () => fetchers.gh(["release", "download", tag, "--repo", repository, "--pattern", fileName, "--output", "-"]));
  };
};

const newest = (versions: readonly string[]): string | null =>
  versions.reduce<string | null>((best, version) => (best === null || isNewerVersion(version, best) ? version : best), null);

export const latestInstallerVersion = async (mirror: string | null, fetchers: Fetchers = networkFetchers): Promise<string | null> => {
  if (mirror !== null) {
    const root = refuseAgentData(mirror);
    const versions = (existsSync(root) ? readdirSync(root) : []).flatMap((name) => {
      const version = KIT_TAG.exec(name)?.[1];
      return version !== undefined && existsSync(join(root, name, `ambitious-${INSTALLER_MODULE}-${version}.mjs`)) ? [version] : [];
    });
    return newest(versions);
  }
  const tag = await viaWebThenGh(
    async () => new TextEncoder().encode(await fetchers.webLatestTag(KIT_REPOSITORY)),
    () => fetchers.gh(["release", "view", "--repo", KIT_REPOSITORY, "--json", "tagName", "--jq", ".tagName"]),
  );
  const version = KIT_TAG.exec(new TextDecoder().decode(tag).trim())?.[1];
  if (version === undefined) throw new Error("the latest release is not a template release");
  return version;
};
