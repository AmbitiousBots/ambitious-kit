#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const USAGE = `Usage: node scripts/template-generate.mjs [--check]

Regenerates the two generated parts of the Ambitious Bot template in template/:

  skills/module-installer/SKILL.md   the release tag, file name and SHA-256 pin of the
                                     bundled installer, ambitious-modules-<version>.mjs
  bot.json                           the payload for creating a bot from the template:
                                     its name, description, instructions, skills and routines

Both are derived from the other files: the installer is built from packages/kit with
template/modules.lock.json embedded, and bot.json is INSTRUCTIONS.md, every
skills/*/SKILL.md and the "ambitious-" sections of routines.md.

With --check nothing is written; the exit code is 1 when a generated part is out of date.
Needs "npm ci" first.
`;

const repoRoot = join(import.meta.dirname, "..");
const template = join(repoRoot, "template");
const installerSkill = join(template, "skills", "module-installer", "SKILL.md");
const botFile = join(template, "bot.json");

const BOT_NAME = "Ambitious Bot";
const BOT_DESCRIPTION =
  "Sets up and looks after your Grok Bots: installs and checks the Ambitious modules, audits what your account can honestly see, and keeps documents in Pages. The free bot template from Ambitious (https://ambitiousbots.com).";

const read = (path) => readFileSync(path, "utf8");

const frontmatter = (text, where) => {
  const match = /^---\n([\s\S]*?)\n---\n+([\s\S]*)$/.exec(text);
  if (match === null) throw new Error(`${where} must start with frontmatter between --- lines.`);
  const value = (field) => {
    const line = new RegExp(`^${field}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(match[1]);
    if (line === null) throw new Error(`${where} needs a "${field}" in its frontmatter.`);
    return line[1].replace(/^(['"])(.*)\1$/, "$2");
  };
  return { name: value("name"), description: value("description"), body: match[2] };
};

const skills = () =>
  readdirSync(join(template, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => frontmatter(read(join(template, "skills", name, "SKILL.md")), `skills/${name}/SKILL.md`));

const routines = () =>
  read(join(template, "routines.md"))
    .split(/^## /m)
    .slice(1)
    .filter((section) => section.startsWith("ambitious-"))
    .map((section) => {
      const [name, ...lines] = section.split("\n");
      const setting = (label) => {
        const index = lines.findIndex((line) => line.startsWith(`${label}: `));
        if (index === -1) throw new Error(`The routine ${name} in routines.md needs a "${label}: " line.`);
        return lines.splice(index, 1)[0].slice(label.length + 2).trim();
      };
      const schedule = setting("Schedule");
      const starts = setting("Starts");
      if (starts !== "active" && starts !== "paused") throw new Error(`The routine ${name} in routines.md must have "Starts: active" or "Starts: paused".`);
      return { name, schedule, prompt: lines.join("\n").trim(), paused: starts === "paused" };
    });

const pinnedInstallerSkill = () => {
  execFileSync(process.execPath, [join(repoRoot, "packages", "kit", "scripts", "build-install.mjs")], { stdio: ["ignore", "ignore", "inherit"] });
  const { version } = JSON.parse(read(join(repoRoot, "package.json")));
  const sha256 = createHash("sha256").update(readFileSync(join(repoRoot, "packages", "kit", "dist", "ambitious-modules.mjs"))).digest("hex");
  const semver = "[0-9]+\\.[0-9]+\\.[0-9]+";
  const pinned = read(installerSkill)
    .replace(new RegExp(`kit-v${semver}`, "g"), `kit-v${version}`)
    .replace(new RegExp(`ambitious-modules-${semver}\\.mjs`, "g"), `ambitious-modules-${version}.mjs`)
    .replace(/[0-9a-f]{64}(?= {2}ambitious-modules-)/g, sha256);
  if (!pinned.includes(`${sha256}  ambitious-modules-${version}.mjs`)) {
    throw new Error("skills/module-installer/SKILL.md has no sha256sum line for the bundled installer to pin.");
  }
  return pinned;
};

const generate = (check) => {
  const stale = [];
  const settle = (path, wanted) => {
    if (read(path) === wanted) return;
    if (check) stale.push(path);
    else writeFileSync(path, wanted);
  };
  settle(installerSkill, pinnedInstallerSkill());
  const bot = { name: BOT_NAME, description: BOT_DESCRIPTION, instructions: read(join(template, "INSTRUCTIONS.md")), skills: skills(), routines: routines() };
  const wanted = `${JSON.stringify(bot, null, 2)}\n`;
  try {
    settle(botFile, wanted);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (check) stale.push(botFile);
    else writeFileSync(botFile, wanted);
  }
  if (stale.length > 0) {
    process.stdout.write(`template: out of date: ${stale.join(", ")}.\nRun "npm run template:generate" and commit the result.\n`);
    return 1;
  }
  process.stdout.write(check ? "template: the installer pin and bot.json are up to date.\n" : "template: wrote the installer pin and bot.json.\n");
  return 0;
};

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
  (args[0] === "--help" ? process.stdout : process.stderr).write(USAGE);
  process.exitCode = args[0] === "--help" ? 0 : 2;
} else {
  try {
    process.exitCode = generate(args[0] === "--check");
  } catch (error) {
    process.stderr.write(`template generate failed: ${error.message}\n`);
    process.exitCode = 2;
  }
}
