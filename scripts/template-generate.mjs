#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { routinesOf } from "../packages/kit/scripts/template-routines.mjs";
import { skillFile, skillNames, skillsOf, skillText } from "../packages/kit/scripts/template-skills.mjs";

const USAGE = `Usage: node scripts/template-generate.mjs [--check]

Regenerates the generated parts of the Ambitious Bot template in template/:

  every skills/*/SKILL.md
             the "Template version: x.y.z" line, set to the version in package.json
  skills/ambitious-module-installer/SKILL.md
             the release tag, file name and SHA-256 pin of the bundled installer,
             ambitious-modules-<version>.mjs
  bot.json   the payload for creating a bot from the template: its name, description,
             version, instructions, skills and routines

All are derived from the other files: the installer is built from packages/kit with
template/modules.lock.json, template/fixtures, template/INSTRUCTIONS.md, the SHA-256
list of template/instructions.json and every skill body embedded, and bot.json is
INSTRUCTIONS.md, every skills/*/SKILL.md and the "ambitious-" sections of routines.md.

The installer carries the skill bodies so that a bot can write them from a file whose
checksum is pinned. Its own SHA-256 cannot be inside it, so the installer skill is
embedded with that one value left blank, and the installer fills it in from the file
it runs from. The pin in the skill therefore never changes what the installer is.

INSTRUCTIONS.md is never rewritten here. It carries an "Instructions version: N" line
that is raised by hand, and only when its text has to change.

With --check nothing is written; the exit code is 1 when a generated part is out of date.
Needs "npm ci" first.
`;

const repoRoot = join(import.meta.dirname, "..");
const template = join(repoRoot, "template");
const botFile = join(template, "bot.json");

const BOT_NAME = "Ambitious Bot";
const BOT_DESCRIPTION =
  "Sets up and looks after your Grok Bots: installs and checks the Ambitious modules, audits what your account can honestly see, and keeps documents in Pages. The free bot template from Ambitious (https://ambitiousbots.com).";

const read = (path) => readFileSync(path, "utf8");

const routines = () => routinesOf(read(join(template, "routines.md")));

const builtInstallerSha256 = () => {
  execFileSync(process.execPath, [join(repoRoot, "packages", "kit", "scripts", "build-install.mjs")], { stdio: ["ignore", "ignore", "inherit"] });
  return createHash("sha256").update(readFileSync(join(repoRoot, "packages", "kit", "dist", "ambitious-modules.mjs"))).digest("hex");
};

const generate = (check) => {
  const stale = [];
  const settle = (path, wanted) => {
    if (read(path) === wanted) return;
    if (check) stale.push(path);
    else writeFileSync(path, wanted);
  };
  const { version } = JSON.parse(read(join(repoRoot, "package.json")));
  const instructions = join(template, "INSTRUCTIONS.md");
  const installerSha256 = builtInstallerSha256();
  for (const name of skillNames(template)) settle(skillFile(template, name), skillText(template, name, version, installerSha256));
  const bot = { name: BOT_NAME, description: BOT_DESCRIPTION, version, instructions: read(instructions), skills: skillsOf(template, version, installerSha256), routines: routines() };
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
  process.stdout.write(check ? "template: the version lines, the installer pin and bot.json are up to date.\n" : "template: wrote the version lines, the installer pin and bot.json.\n");
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
