import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readJson, repoRoot, sha256, skillOnly, templateRoot } from "./support.mjs";

const KIT_VERSION = "0.4.8";
const INSTRUCTIONS_VERSION = 13;
const INSTRUCTIONS_FIRST_TEMPLATE = "0.4.6";
const INSTRUCTIONS_SHA256 = "897ae5617ea294be7c76ec60c7c5baa9780d23b2765780b17080e798eb6d3d55";
const ROUTINES_SHA256 = "33d424e85eb6f9a3bfd2a2f021e741f43aa330101939e788f1bd2146f33081f4";
const PINS_SHA256 = "7bcc69b5d65237e4025a8a5fdc69720d71c73355600058ab04fb309cf9e33a63";

const text = (...path) => readFileSync(join(repoRoot, ...path), "utf8");
const bot = readJson(join(templateRoot, "bot.json"));

test(`the kit, its packages, the example module and the lockfile are all version ${KIT_VERSION}`, () => {
  const versions = ["package.json", "packages/kit/package.json", "packages/lint/package.json", "packages/depcruise/package.json", "examples/hello/package.json"].map((file) => [
    file,
    readJson(join(repoRoot, file)).version,
  ]);
  assert.deepEqual(
    versions,
    versions.map(([file]) => [file, KIT_VERSION]),
  );
  assert.equal(readJson(join(repoRoot, "examples", "hello", "package.json")).devDependencies["@ambitious/kit"], KIT_VERSION);
  const locked = readJson(join(repoRoot, "package-lock.json")).packages;
  assert.deepEqual(
    ["", "examples/hello", "packages/kit", "packages/lint", "packages/depcruise"].map((path) => locked[path].version),
    Array(5).fill(KIT_VERSION),
  );
  assert.match(text("examples", "hello", "test", "cli.test.ts"), new RegExp(`"version":"${KIT_VERSION.replaceAll(".", "\\.")}"`, "u"));
});

test(`bot.json, every skill and the installer pin carry template version ${KIT_VERSION}`, () => {
  assert.equal(bot.version, KIT_VERSION);
  const skills = readdirSync(join(templateRoot, "skills"), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  assert.ok(skills.length >= 15);
  for (const { name } of skills) {
    assert.match(skillOnly(name), new RegExp(`^Template version: ${KIT_VERSION.replaceAll(".", "\\.")}$`, "mu"), `${name} carries the template version line`);
  }
  assert.ok(bot.skills.every(({ body }) => body.startsWith(`Template version: ${KIT_VERSION}\n`)));
  const installerSkill = skillOnly("ambitious-module-installer");
  assert.ok(installerSkill.includes(`releases/download/kit-v${KIT_VERSION}/ambitious-modules-${KIT_VERSION}.mjs`));
  assert.doesNotMatch(installerSkill, /ambitious-modules-0\.4\.6\.mjs/u, "the installer skill pins this release, not the one before");
});

test(`the instructions stay version ${INSTRUCTIONS_VERSION}, byte for byte the text template ${INSTRUCTIONS_FIRST_TEMPLATE} published, in the file and in bot.json`, () => {
  const instructions = text("template", "INSTRUCTIONS.md");
  assert.ok(instructions.startsWith(`Instructions version: ${INSTRUCTIONS_VERSION}\n`));
  assert.equal(sha256(instructions), INSTRUCTIONS_SHA256);
  assert.equal(bot.instructions, instructions, "bot.json embeds the same instructions text");
  assert.ok(bot.instructions.startsWith(`Instructions version: ${INSTRUCTIONS_VERSION}\n`));
  const { versions } = readJson(join(templateRoot, "instructions.json"));
  const current = versions.at(-1);
  assert.deepEqual(
    [current.version, current.firstTemplate, current.file, current.sha256],
    [INSTRUCTIONS_VERSION, INSTRUCTIONS_FIRST_TEMPLATE, "INSTRUCTIONS.md", INSTRUCTIONS_SHA256],
    "no instructions version was published by this release",
  );
  assert.equal(versions.length, INSTRUCTIONS_VERSION);
});

test("this release changes no routine prompt, and it moves only the tasks, records and compliance pins", () => {
  assert.equal(sha256(text("template", "routines.md")), ROUTINES_SHA256, "template/routines.md is the file template 0.4.6 had");
  assert.equal(sha256(text("template", "modules.lock.json")), PINS_SHA256, "template/modules.lock.json pins tasks 0.1.3, records 0.1.1 and compliance 0.1.1");
  const versions = Object.fromEntries(readJson(join(templateRoot, "modules.lock.json")).map((row) => [row.module, row.version]));
  assert.deepEqual(
    { tasks: versions.tasks, records: versions.records, compliance: versions.compliance, contracts: versions.contracts, audit: versions.audit, video: versions.video, scheduling: versions.scheduling, constraints: versions.constraints },
    { tasks: "0.1.3", records: "0.1.1", compliance: "0.1.1", contracts: "0.1.0", audit: "0.3.0", video: "0.1.0", scheduling: "0.1.0", constraints: "0.1.0" },
  );
  const history = readJson(join(templateRoot, "routines.json"));
  for (const [name, { current }] of Object.entries(history)) {
    assert.notEqual(current.firstTemplate, KIT_VERSION, `${name} has no prompt first published by ${KIT_VERSION}`);
  }
});

test(`the README and the package guides name the ${KIT_VERSION} release files and carry its release notes`, () => {
  const readme = text("README.md");
  for (const name of ["kit", "lint", "depcruise"]) assert.ok(readme.includes(`file:vendor/ambitious-${name}-${KIT_VERSION}.tgz`), name);
  assert.ok(readme.includes(`\`kit-v${KIT_VERSION}\``));
  const notes = readme.split(`\n### ${KIT_VERSION}\n`)[1]?.split("\n### ")[0] ?? "";
  for (const required of ["tasks 0.1.3", "records 0.1.1", "compliance 0.1.1", "`ambitious-tasks-page`", "stay at version 13", "Other module pins are unchanged", "`--help`", "`input`"]) {
    assert.ok(notes.includes(required), `the ${KIT_VERSION} release notes say: ${required}`);
  }
  assert.ok(readme.indexOf(`### ${KIT_VERSION}`) < readme.indexOf("### 0.4.6"), "the newest release notes come first, and the earlier ones stay as history");
  assert.ok(text("packages", "kit", "README.md").includes(`ambitious-modules-${KIT_VERSION}.mjs`));
  assert.ok(text("packages", "kit-python", "README.md").includes(`ambitious_kit-${KIT_VERSION}.pyz`));
  assert.ok(text("MODULE_CONTRACT.md").includes(`ambitious-install-${KIT_VERSION}.mjs`));
  assert.ok(text("examples", "hello", "README.md").includes(`"version":"${KIT_VERSION}"`));
});
