import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { test, type TestContext } from "node:test";

const kitRoot = join(import.meta.dirname, "..");
const templateDir = join(kitRoot, "repo-template");
const script = join(kitRoot, "scripts", "apply-template.mjs");

const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();

const templateFiles = filesUnder(templateDir);

const emptyDir = (t: TestContext): string => {
  const dir = mkdtempSync(join(tmpdir(), "ambitious-apply-template-"));
  t.after(() => rmSync(dir, { recursive: true }));
  return dir;
};

type Run = { readonly exitCode: number | null; readonly stdout: string; readonly stderr: string };

const apply = (...args: readonly string[]): Run => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};

const read = (dir: string, file: string): string => readFileSync(join(dir, file), "utf8");

test("the template holds every file a module repo starts with", () => {
  assert.deepEqual(templateFiles, [
    ".cursor/rules/agent-models.mdc",
    ".github/pull_request_template.md",
    ".mise.toml",
    "AGENTS.md",
    "CLAUDE.md",
    "LICENSE",
    "NOTICE",
    "package.json",
    "scripts/check-standalone.mjs",
    "scripts/tla2tools.mjs",
    "scripts/tlc.mjs",
    "spec/README.md",
    "spec/Sample.cfg",
    "spec/Sample.tla",
    "spec/broken/EXPECTED.json",
    "spec/broken/SampleNoGuard.cfg",
    "spec/broken/SampleNoGuard.tla",
    "src/ai/README.md",
    "src/cli/README.md",
    "src/db/README.md",
    "src/domain/README.md",
    "test/README.md",
    "verify/SKILL.md",
    "verify/features.json",
    "verify/formal/SKILL.md",
    "verify/run",
  ]);
  assert.ok(read(templateDir, "AGENTS.md").split("\n").length <= 60);
  assert.equal(read(templateDir, "CLAUDE.md"), "See AGENTS.md\n");
  assert.equal(read(templateDir, "LICENSE"), read(kitRoot, "LICENSE"));
  assert.match(read(templateDir, ".cursor/rules/agent-models.mdc"), /^# budget: large \(xhigh\)$/m);
  for (const heading of ["## Why", "## What changed", "## Evidence"]) {
    assert.ok(read(templateDir, ".github/pull_request_template.md").includes(heading));
  }
});

test("applying to an empty repo creates every template file and says so", (t) => {
  const target = emptyDir(t);
  const run = apply(target);

  assert.equal(run.exitCode, 0, run.stderr);
  assert.deepEqual(filesUnder(target), templateFiles);
  for (const file of templateFiles) {
    assert.equal(read(target, file), read(templateDir, file));
    assert.ok(run.stdout.includes(`created  ${file}\n`), run.stdout);
  }
  assert.match(run.stdout, /26 created, 0 kept/);
});

test("applying twice changes nothing the second time", (t) => {
  const target = emptyDir(t);
  apply(target);
  const before = templateFiles.map((file) => read(target, file));
  const run = apply(target);

  assert.equal(run.exitCode, 0, run.stderr);
  assert.deepEqual(templateFiles.map((file) => read(target, file)), before);
  assert.deepEqual(filesUnder(target), templateFiles);
  assert.match(run.stdout, /0 created, 26 kept/);
});

test("a file the repo already has is kept as it is", (t) => {
  const target = emptyDir(t);
  writeFileSync(join(target, "AGENTS.md"), "This repo's own guide.\n");
  mkdirSync(join(target, "src", "domain"), { recursive: true });
  writeFileSync(join(target, "src", "domain", "README.md"), "Already here.\n");
  const run = apply(target);

  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(read(target, "AGENTS.md"), "This repo's own guide.\n");
  assert.equal(read(target, "src/domain/README.md"), "Already here.\n");
  assert.ok(run.stdout.includes("kept  AGENTS.md\n"), run.stdout);
  assert.ok(run.stdout.includes("kept  src/domain/README.md\n"), run.stdout);
  assert.match(run.stdout, /24 created, 2 kept/);
});

test("a dry run lists what it would create and writes nothing", (t) => {
  const target = emptyDir(t);
  const run = apply(target, "--dry-run");

  assert.equal(run.exitCode, 0, run.stderr);
  assert.deepEqual(filesUnder(target), []);
  assert.ok(run.stdout.includes("would create  AGENTS.md\n"), run.stdout);
  assert.match(run.stdout, /26 to create, 0 kept/);
});

test("a target that is not a directory is refused", (t) => {
  const missing = join(emptyDir(t), "missing");
  const run = apply(missing);

  assert.equal(run.exitCode, 1);
  assert.equal(run.stdout, "");
  assert.match(run.stderr, /is not a directory/);
  assert.equal(apply().exitCode, 1);
});

test("a symbolic link that leads outside the target is refused and nothing is written", (t) => {
  const target = emptyDir(t);
  const outside = emptyDir(t);
  symlinkSync(outside, join(target, "src"));
  const run = apply(target);

  assert.equal(run.exitCode, 1);
  assert.match(run.stderr, /Nothing was written/);
  assert.match(run.stderr, /src\/domain\/README\.md/);
  assert.deepEqual(filesUnder(outside), []);
  assert.deepEqual(filesUnder(target), []);
});

test("the kit repo itself has every template file", () => {
  const run = apply(kitRoot, "--dry-run");

  assert.equal(run.exitCode, 0, run.stderr);
  assert.match(run.stdout, /0 to create, 26 kept/);
});

const SHARED_WITH_THE_KIT = [
  ".mise.toml",
  "scripts/check-standalone.mjs",
  "scripts/tla2tools.mjs",
  "scripts/tlc.mjs",
  "spec/Sample.cfg",
  "spec/Sample.tla",
  "spec/broken/EXPECTED.json",
  "spec/broken/SampleNoGuard.cfg",
  "spec/broken/SampleNoGuard.tla",
  "verify/run",
];

test("the checks and sample models a module starts with are the kit's own, byte for byte", () => {
  for (const file of SHARED_WITH_THE_KIT) {
    assert.equal(read(templateDir, file), read(kitRoot, file), `repo-template/${file} differs from ${file}`);
  }
  assert.equal(
    read(kitRoot, "packages/lint/bin/ambitious-standalone.mjs"),
    read(kitRoot, "scripts/check-standalone.mjs"),
    "the ambitious-standalone bin differs from scripts/check-standalone.mjs",
  );
});

const command = (cwd: string, program: string, ...args: readonly string[]): Run => {
  const result = spawnSync(program, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: cwd },
  });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
};

const track = (repo: string): void => {
  command(repo, "git", "add", "--all");
};

const moduleRepo = (t: TestContext): string => {
  const repo = realpathSync(emptyDir(t));
  command(repo, "git", "init", "--quiet");
  apply(repo);
  track(repo);
  return repo;
};

const MACHINE_PATH = ["", "Users", "someone", "notes.txt"].join("/");
const MACHINE_PATH_FIX =
  "Replace the machine path with a repo-relative path or a documented variable such as $AMBITIOUS_HOME, or list a documented runtime path in .standalone.json with a reason.";

test("npm run lint in a repo made from the template fails on a machine path and says how to fix it", (t) => {
  const repo = moduleRepo(t);
  const clean = command(repo, "npm", "run", "--silent", "lint");
  assert.equal(clean.exitCode, 0, clean.stdout + clean.stderr);
  assert.match(clean.stdout, /standalone check: ok/);

  writeFileSync(join(repo, "NOTES.md"), `See ${MACHINE_PATH} for details.\n`);
  track(repo);
  const dirty = command(repo, "npm", "run", "--silent", "lint");
  assert.equal(dirty.exitCode, 1, dirty.stdout + dirty.stderr);
  assert.ok(dirty.stdout.includes(`NOTES.md:1: machine-path "${MACHINE_PATH}"`), dirty.stdout);
  assert.ok(dirty.stdout.includes(MACHINE_PATH_FIX), dirty.stdout);

  const bin = command(kitRoot, join(kitRoot, "node_modules", ".bin", "ambitious-standalone"), "--repo", repo);
  assert.equal(bin.exitCode, 1, bin.stdout + bin.stderr);
  assert.equal(bin.stdout, dirty.stdout);
});

test("npm run tlc in a repo made from the template passes, and fails once the broken variant stops breaking", (t) => {
  const repo = moduleRepo(t);
  const sound = command(repo, "npm", "run", "--silent", "tlc");
  assert.equal(sound.exitCode, 0, sound.stdout + sound.stderr);
  assert.match(sound.stdout, /tlc: ok\. 2 of 2 models behaved as required\.\n$/);

  writeFileSync(
    join(repo, "spec", "broken", "SampleNoGuard.tla"),
    read(repo, "spec/Sample.tla").replace("MODULE Sample ", "MODULE SampleNoGuard "),
  );
  const unsound = command(repo, "npm", "run", "--silent", "tlc");
  assert.equal(unsound.exitCode, 1, unsound.stdout + unsound.stderr);
  assert.ok(
    unsound.stdout.includes("FAIL: spec/broken/SampleNoGuard must break WithinCapacity but passed."),
    unsound.stdout,
  );
});

type Feature = { readonly id: string; readonly userVisible: string; readonly check: string };

const isFeature = (value: unknown): value is Feature =>
  typeof value === "object" &&
  value !== null &&
  ["id", "userVisible", "check"].every((key) => key in value && typeof Object.getOwnPropertyDescriptor(value, key)?.value === "string") &&
  Object.keys(value).length === 3;

test("the feature list names the standalone check and the model check, each with the command that proves it", () => {
  const features: unknown = JSON.parse(read(templateDir, "verify/features.json"));
  assert.ok(Array.isArray(features) && features.every(isFeature));
  assert.deepEqual(
    features.map(({ id, check }) => [id, check]),
    [
      ["standalone", "node scripts/check-standalone.mjs"],
      ["models", "node scripts/tlc.mjs"],
    ],
  );
});

test("each skill in the template has the frontmatter that registers it", () => {
  for (const [file, name] of [
    ["verify/SKILL.md", "verify-module"],
    ["verify/formal/SKILL.md", "verify-module-formal"],
  ] as const) {
    assert.match(read(templateDir, file), new RegExp(`^---\\nname: ${name}\\ndescription: \\S.{80,}\\n---\\n`), file);
    assert.match(read(kitRoot, file), /^---\nname: verify-ambitious-kit(-formal)?\ndescription: \S.{80,}\n---\n/, file);
  }
});

test("verify/run in a repo made from the template runs every feature against its own fresh AMBITIOUS_HOME and prints a table", (t) => {
  const repo = moduleRepo(t);
  assert.equal(statSync(join(repo, "verify", "run")).mode & 0o111, 0o111);
  writeFileSync(
    join(repo, "verify", "features.json"),
    JSON.stringify([
      { id: "standalone", userVisible: "Anyone can read this repository.", check: "node scripts/check-standalone.mjs" },
      { id: "home-is-fresh", userVisible: "Each check gets an empty home.", check: 'test -d "$AMBITIOUS_HOME" && test -z "$(ls -A "$AMBITIOUS_HOME")" && touch "$AMBITIOUS_HOME/used"' },
      { id: "home-is-fresh-again", userVisible: "The next check gets another empty home.", check: 'test -z "$(ls -A "$AMBITIOUS_HOME")"' },
    ]),
  );
  const passing = command(repo, join(repo, "verify", "run"));
  assert.equal(passing.exitCode, 0, passing.stdout + passing.stderr);
  assert.match(passing.stdout, /^standalone +pass +Anyone can read this repository\.$/m);
  assert.match(passing.stdout, /^home-is-fresh-again +pass /m);
  assert.match(passing.stdout, /verify: ok\. 3 of 3 features pass\.\n$/);

  writeFileSync(join(repo, "NOTES.md"), `See ${MACHINE_PATH} for details.\n`);
  track(repo);
  const failing = command(repo, "npm", "run", "--silent", "verify");
  assert.equal(failing.exitCode, 1, failing.stdout + failing.stderr);
  assert.match(failing.stdout, /^standalone +FAIL /m);
  assert.match(failing.stdout, /^home-is-fresh +pass /m);
  assert.ok(failing.stdout.includes(`NOTES.md:1: machine-path "${MACHINE_PATH}"`), failing.stdout);
  assert.match(failing.stdout, /verify: 1 of 3 features failed: standalone\.\n$/);
  const evidence = /^Full output of every check: (.+)$/m.exec(failing.stdout)?.[1] ?? "";
  t.after(() => rmSync(evidence, { recursive: true, force: true }));
  assert.ok(read(evidence, "standalone.log").includes("exit 1"));

  const only = command(repo, "node", "verify/run", "--only", "home-is-fresh");
  assert.equal(only.exitCode, 0, only.stdout + only.stderr);
  assert.match(only.stdout, /verify: ok\. 1 of 1 features pass\./);
});

test("verify/run refuses a feature list it cannot trust", (t) => {
  const repo = moduleRepo(t);
  const withFeatures = (features: unknown): Run => {
    writeFileSync(join(repo, "verify", "features.json"), JSON.stringify(features));
    return command(repo, "node", "verify/run");
  };
  const refused: readonly (readonly [unknown, RegExp])[] = [
    [[], /non-empty list/],
    [[{ id: "a", userVisible: "A.", check: "true", extra: 1 }], /exactly the fields id, userVisible and check/],
    [[{ id: "Not Kebab", userVisible: "A.", check: "true" }], /lower-case words joined by hyphens/],
    [[{ id: "a", userVisible: "", check: "true" }], /userVisible must be a plain sentence/],
    [[{ id: "a", userVisible: "A.", check: "true" }, { id: "a", userVisible: "B.", check: "true" }], /lists the feature "a" twice/],
  ];
  for (const [features, message] of refused) {
    const run = withFeatures(features);
    assert.equal(run.exitCode, 2, run.stdout + run.stderr);
    assert.match(run.stderr, message);
  }
  assert.equal(command(repo, "node", "verify/run", "--only", "missing").exitCode, 2);
});
