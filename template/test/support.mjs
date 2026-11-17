import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { guideFile, guidesNamedIn, guideTopics } from "../../packages/kit/scripts/template-guides.mjs";

export const templateRoot = dirname(dirname(fileURLToPath(import.meta.url)));
export const repoRoot = dirname(templateRoot);
export const installer = join(repoRoot, "packages", "kit", "dist", "ambitious-modules.mjs");

export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const lock = () => readJson(join(templateRoot, "modules.lock.json"));

export const SKILL_PREFIX = "ambitious-";

export const skillOnly = (name) => readFileSync(join(templateRoot, "skills", name, "SKILL.md"), "utf8");
export const guideText = (topic) => readFileSync(guideFile(templateRoot, topic), "utf8");
export const guidesOfSkill = (name) => guidesNamedIn(skillOnly(name));
export const allGuideTopics = () => guideTopics(templateRoot);
export const skillProse = (name) => [skillOnly(name), ...guidesOfSkill(name).map(guideText)].join("\n");
export const VERSION_LINE = /^Template version: [0-9]+\.[0-9]+\.[0-9]+$/;

export const releasedText = (entry) => {
  const lines = readFileSync(join(templateRoot, "skills", entry.skill, "SKILL.md"), "utf8").split("\n");
  const end = lines.indexOf("---", 1);
  if (lines[0] !== "---" || end === -1) throw new Error(`${entry.skill}: frontmatter must start the file`);
  for (const [field, released] of Object.entries(entry.releasedFrontmatter)) {
    const at = lines.findIndex((line, index) => index < end && line.startsWith(`${field}:`));
    if (at === -1 || !released.startsWith(`${field}:`)) throw new Error(`${entry.skill}: no ${field} line to put the released one back into`);
    lines[at] = released;
  }
  if (!VERSION_LINE.test(lines[end + 2] ?? "") || lines[end + 1] !== "" || lines[end + 3] !== "") throw new Error(`${entry.skill}: the body must start with a "Template version: x.y.z" line and a blank line`);
  lines.splice(end + 2, 2);
  return lines.join("\n");
};

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
