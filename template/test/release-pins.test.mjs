import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { readJson, repoRoot, sha256, skillOnly, templateRoot } from "./support.mjs";

const KIT_VERSION = "0.6.0";
const INSTRUCTIONS_VERSION = 15;
const INSTRUCTIONS_FIRST_TEMPLATE = "0.6.0";
const INSTRUCTIONS_SHA256 = "fae84962a01c79573c945633e4e9f6468b474425f16d079614db1d7c07f470e1";
const PREVIOUS_INSTRUCTIONS_SHA256 = "1ea37da67bd0f5366fc9138cfa2f94d37ee705c9dd9446b359dd4d28b4cf8b83";
const NEW_GRANTS = ["fact-tools", "recipe-tools"];
const WITHDRAWN_GRANTS = ["record-tools", "commitment-tools"];
const PROMPT_FIRST_TEMPLATES = { "ambitious-selfcheck": "0.4.6", "ambitious-snapshot": "0.4.5" };
const PINS_SHA256 = "8291fe6e57927db8a893fc92458b980cee09018ea07552c135d26537108441f3";

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
  assert.doesNotMatch(installerSkill, /ambitious-modules-0\.5\.0\.mjs/u, "the installer skill pins this release, not the one before");
});

test(`the instructions are version ${INSTRUCTIONS_VERSION}, first published by this release, in the file and in bot.json, and version ${INSTRUCTIONS_VERSION - 1} is kept byte for byte, and the difference in what is allowed is the two grants added and the two taken away`, () => {
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
    "this release publishes one instructions version",
  );
  assert.equal(versions.length, INSTRUCTIONS_VERSION);
  const previous = versions.at(-2);
  assert.deepEqual([previous.version, previous.file, previous.sha256, sha256(text("template", previous.file))], [INSTRUCTIONS_VERSION - 1, `instructions/${INSTRUCTIONS_VERSION - 1}.md`, PREVIOUS_INSTRUCTIONS_SHA256, PREVIOUS_INSTRUCTIONS_SHA256], "the text template 0.5.0 published is kept unchanged");
  assert.deepEqual([current.grants.filter((grant) => !previous.grants.includes(grant)), previous.grants.filter((grant) => !current.grants.includes(grant))], [NEW_GRANTS, WITHDRAWN_GRANTS], "the new version adds the fact and recipe grants and takes away the two grants of the stores the service is retiring");
  assert.deepEqual(Object.keys(current.reasons).slice(-NEW_GRANTS.length), NEW_GRANTS, "each new grant carries its reason");
});

test("the routine prompts are unchanged and the module pins are the ones template 0.4.10 had", () => {
  assert.equal(sha256(text("template", "modules.lock.json")), PINS_SHA256, "template/modules.lock.json pins the module releases template 0.4.10 pinned");
  const versions = Object.fromEntries(readJson(join(templateRoot, "modules.lock.json")).map((row) => [row.module, row.version]));
  assert.deepEqual(
    { tasks: versions.tasks, records: versions.records, compliance: versions.compliance, contracts: versions.contracts, audit: versions.audit, video: versions.video, scheduling: versions.scheduling, constraints: versions.constraints },
    { tasks: "0.1.4", records: "0.1.2", compliance: "0.1.2", contracts: "0.1.1", audit: "0.4.1", video: "0.1.1", scheduling: "0.1.1", constraints: "0.1.1" },
  );
  const history = readJson(join(templateRoot, "routines.json"));
  for (const [name, { current }] of Object.entries(history)) {
    assert.equal(current.firstTemplate, PROMPT_FIRST_TEMPLATES[name], `${name} keeps the prompt an earlier template first published`);
  }
});

test(`the README and the package guides name the ${KIT_VERSION} release files and carry its release notes`, () => {
  const readme = text("README.md");
  for (const name of ["kit", "lint", "depcruise"]) assert.ok(readme.includes(`file:vendor/ambitious-${name}-${KIT_VERSION}.tgz`), name);
  const { devDependencies } = readJson(join(repoRoot, "package.json"));
  const templateGuide = text("repo-template", "CONTRIBUTING.md");
  for (const name of ["@ambitious/typescript7", "typescript"]) {
    assert.ok(templateGuide.includes(`\`${name}\` to \`${devDependencies[name]}\``), `the template guide pins ${name}`);
  }
  assert.ok(readme.includes(`\`kit-v${KIT_VERSION}\``));
  const notes = readme.split(`\n### ${KIT_VERSION}\n`)[1]?.split("\n### ")[0] ?? "";
  for (const required of ["Instructions version 15 adds two grants to version 14", ...[...NEW_GRANTS, ...WITHDRAWN_GRANTS].map((grant) => `\`${grant}\``), "a fact is usable as soon as it is written", "only a signed-in member of the owner's organization marks a fact verified, activates a recipe that waits for a person or answers a step that waits for a person, on the service's `/records` page", "a bot never marks a fact verified and never claims that one is", "Version 14 is kept as `template/instructions/14.md`", "A bot on version 13 or 14 applies version 15 itself on its daily selfcheck", "The routine prompts are unchanged, and so are the module pins", "tasks 0.1.4", "records 0.1.2", "contracts 0.1.1", "compliance 0.1.2", "audit 0.4.1", "video 0.1.1", "scheduling 0.1.1", "constraints 0.1.1", "Nothing a bot already keeps in a module's database is moved or deleted."]) {
    assert.ok(notes.includes(required), `the ${KIT_VERSION} release notes say: ${required}`);
  }
  assert.ok(readme.indexOf(`### ${KIT_VERSION}`) < readme.indexOf("### 0.5.0"), "the newest release notes come first, and the earlier ones stay as history");
  assert.ok(text("packages", "kit", "README.md").includes(`ambitious-modules-${KIT_VERSION}.mjs`));
  assert.ok(text("packages", "kit-python", "README.md").includes(`ambitious_kit-${KIT_VERSION}.pyz`));
  assert.ok(text("MODULE_CONTRACT.md").includes(`ambitious-install-${KIT_VERSION}.mjs`));
  assert.ok(text("examples", "hello", "README.md").includes(`"version":"${KIT_VERSION}"`));
});
