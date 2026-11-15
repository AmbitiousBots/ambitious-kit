import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const templateRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const repoRoot = dirname(templateRoot);
export const installer = join(repoRoot, "packages", "kit", "dist", "ambitious-modules.mjs");

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const lock = () => readJson(join(templateRoot, "modules.lock.json"));

export const buildInstaller = () => {
  execFileSync(process.execPath, [join(repoRoot, "packages", "kit", "scripts", "build-install.mjs")], { stdio: ["ignore", "ignore", "inherit"] });
  return installer;
};

export const ghSignedIn = () => spawnSync("gh", ["auth", "status"], { stdio: "ignore" }).status === 0;

export const NO_GH = "the GitHub CLI (gh) is not installed or not signed in, so the released files cannot be fetched";

export const gh = (args) => execFileSync("gh", args, { maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });

export const releaseOf = (row) => {
  const [, repository, tag, asset] = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/download\/([^/]+)\/([^/]+)$/.exec(row.url) ?? [];
  return { repository, tag, asset };
};

export const sync = (home, args = [], environment = {}) => {
  const { AMBITIOUS_MODULE_MIRROR: _mirror, ...inherited } = process.env;
  const run = spawnSync(process.execPath, [installer, "sync", "--json", ...args], { encoding: "utf8", env: { ...inherited, AMBITIOUS_HOME: home, ...environment } });
  return { status: run.status, stderr: run.stderr, envelope: JSON.parse(run.stdout) };
};
