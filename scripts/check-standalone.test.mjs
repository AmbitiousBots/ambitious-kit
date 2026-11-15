import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-standalone.mjs");

const PLAN_ID = ["P0", "03"].join("-");
const PLAN_FIX = "Replace the internal plan ID with a plain description of the requirement.";
const PATH_FIX =
  "Replace the machine path with a repo-relative path or a documented variable such as $AMBITIOUS_HOME, or list a documented runtime path in .standalone.json with a reason.";

const rooted = (...parts) => ["", ...parts].join("/");
const MAC_PATH = rooted("Users", "someone", "notes.txt");
const LINUX_PATH = rooted("home", "someone", "notes.txt");
const WORKSPACE_PATH = rooted("workspace", "scratch", "notes.txt");
const WINDOWS_PATH = ["C:", "Users", "someone", "notes.txt"].join("\\");
const RUNTIME_HOME = rooted("workspace", "product");

const git = (repo, ...args) =>
  execFileSync(
    "git",
    ["-C", repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { encoding: "utf8" },
  );

const makeRepo = (files) => {
  const repo = mkdtempSync(join(tmpdir(), "standalone-check-"));
  git(repo, "init", "--quiet", "--initial-branch=main");
  commitFiles(repo, files, "Start the project");
  return repo;
};

const commitFiles = (repo, files, message) => {
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, name)), { recursive: true });
    writeFileSync(join(repo, name), content);
  }
  git(repo, "add", "--all");
  git(repo, "commit", "--quiet", "--allow-empty", "-m", message);
};

const check = (repo, ...args) => {
  const result = spawnSync(process.execPath, [script, "--repo", repo, ...args], { encoding: "utf8" });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

const allowFile = (...entries) => `${JSON.stringify({ allow: entries })}\n`;

test("a repository with no internal references passes", () => {
  const repo = makeRepo({ "README.md": "Run `npm test`. Data lives under $AMBITIOUS_HOME/data.\n" });
  const result = check(repo);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /standalone check: ok \(1 sources scanned\)/);
});

test("an internal plan ID is reported with file, line, rule and fix", () => {
  const repo = makeRepo({ "docs/guide.md": `First line.\nThis implements ${PLAN_ID} from the roadmap.\n` });
  const result = check(repo);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`docs/guide.md:2: plan-id "${PLAN_ID}"`), result.stdout);
  assert.ok(result.stdout.includes(PLAN_FIX), result.stdout);
});

test("identifiers that only resemble a plan ID are not reported", () => {
  const repo = makeRepo({ "README.md": "Paper size P4, part XP0-03A, ratio P1-2, range P100-20.\n" });
  assert.equal(check(repo).status, 0);
});

for (const [name, path] of [
  ["macOS home", MAC_PATH],
  ["Linux home", LINUX_PATH],
  ["workspace", WORKSPACE_PATH],
  ["Windows home", WINDOWS_PATH],
]) {
  test(`a ${name} path is reported as a machine path`, () => {
    const repo = makeRepo({ "README.md": `Open ${path} to continue.\n` });
    const result = check(repo);
    assert.equal(result.status, 1);
    assert.ok(result.stdout.includes(`README.md:1: machine-path "${path}"`), result.stdout);
    assert.ok(result.stdout.includes(PATH_FIX), result.stdout);
  });
}

test("the same directory names inside a relative path, URL or variable are not reported", () => {
  const repo = makeRepo({
    "README.md": [
      `See docs${MAC_PATH} and https://example.com${LINUX_PATH}.`,
      `Data is in $AMBITIOUS_HOME${WORKSPACE_PATH}.`,
      "",
    ].join("\n"),
  });
  const result = check(repo);
  assert.equal(result.status, 0, result.stdout);
});

test("a documented runtime path listed with a reason is allowed, including paths below it", () => {
  const repo = makeRepo({
    "README.md": `The default home is ${RUNTIME_HOME}. Binaries go in ${RUNTIME_HOME}/bin/tool.\n`,
    ".standalone.json": allowFile({ pattern: RUNTIME_HOME, reason: "Documented default home directory." }),
  });
  const result = check(repo);
  assert.equal(result.status, 0, result.stdout);
});

test("an allowed path does not allow a sibling whose name merely starts the same", () => {
  const sibling = `${RUNTIME_HOME}-private/notes`;
  const repo = makeRepo({
    "README.md": `Home is ${RUNTIME_HOME}. Never mention ${sibling}.\n`,
    ".standalone.json": allowFile({ pattern: RUNTIME_HOME, reason: "Documented default home directory." }),
  });
  const result = check(repo);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`machine-path "${sibling}"`), result.stdout);
  assert.match(result.stdout, /1 finding\(s\)/);
});

test("an allow entry without a reason is refused and allows nothing", () => {
  const repo = makeRepo({
    "README.md": `The default home is ${RUNTIME_HOME}.\n`,
    ".standalone.json": allowFile({ pattern: RUNTIME_HOME }),
  });
  const result = check(repo);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(".standalone.json:1: allow-list"), result.stdout);
  assert.ok(result.stdout.includes('a "reason"'), result.stdout);
  assert.ok(result.stdout.includes(`README.md:1: machine-path "${RUNTIME_HOME}"`), result.stdout);
});

test("an allow entry nothing uses is reported on a full scan", () => {
  const repo = makeRepo({
    "README.md": "Nothing to see.\n",
    ".standalone.json": allowFile({ pattern: RUNTIME_HOME, reason: "Documented default home directory." }),
  });
  const result = check(repo);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`.standalone.json:1: allow-list "${RUNTIME_HOME}"`), result.stdout);
  assert.ok(result.stdout.includes("Remove this allow entry"), result.stdout);
});

test("an allow list that is not valid JSON is reported", () => {
  const repo = makeRepo({ "README.md": "Fine.\n", ".standalone.json": "{ not json" });
  const result = check(repo);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(".standalone.json:1: allow-list"), result.stdout);
});

test("the allow list never excuses a plan ID", () => {
  const repo = makeRepo({
    "README.md": `Tracks ${PLAN_ID}.\n`,
    ".standalone.json": allowFile({ pattern: PLAN_ID, reason: "Trying to excuse a plan ID." }),
  });
  const result = check(repo);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`README.md:1: plan-id "${PLAN_ID}"`), result.stdout);
});

test("--changed scans only files changed since the base and skips the unused-entry rule", () => {
  const repo = makeRepo({
    "old.md": `Legacy note about ${PLAN_ID}.\n`,
    ".standalone.json": allowFile({ pattern: RUNTIME_HOME, reason: "Documented default home directory." }),
  });
  git(repo, "checkout", "--quiet", "-b", "feature");
  commitFiles(repo, { "new.md": "A clean new file.\n" }, "Add a clean file");
  assert.equal(check(repo, "--changed", "main").status, 0);
  assert.equal(check(repo).status, 1);

  commitFiles(repo, { "new.md": `See ${MAC_PATH}.\n` }, "Point at a file");
  const result = check(repo, "--changed", "main");
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`new.md:1: machine-path "${MAC_PATH}"`), result.stdout);
  assert.ok(!result.stdout.includes("old.md"), result.stdout);
});

test("--text-file scans extra text such as a pull request description", () => {
  const repo = makeRepo({ "README.md": "Fine.\n" });
  const body = join(mkdtempSync(join(tmpdir(), "standalone-text-")), "pr-body.md");
  writeFileSync(body, `## Why\n\nCloses ${PLAN_ID}.\n`);
  const result = check(repo, "--text-file", body);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`${body}:3: plan-id "${PLAN_ID}"`), result.stdout);
});

test("--commits scans commit messages in the range and names the commit", () => {
  const repo = makeRepo({ "README.md": "Fine.\n" });
  git(repo, "checkout", "--quiet", "-b", "feature");
  commitFiles(repo, { "a.md": "One.\n" }, "Add a file");
  commitFiles(repo, { "b.md": "Two.\n" }, `Add another file\n\nThis finishes ${PLAN_ID}.`);
  const hash = git(repo, "rev-parse", "HEAD").trim().slice(0, 12);
  const result = check(repo, "--commits", "main..HEAD");
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`commit ${hash}:3: plan-id "${PLAN_ID}"`), result.stdout);
  assert.match(result.stdout, /1 finding\(s\)/);
  assert.equal(check(repo, "--commits", "main..HEAD~1").status, 0);
});

test("--deny-file adds organisation-specific patterns kept outside the repository", () => {
  const term = ["Project", "Nightjar"].join(" ");
  const repo = makeRepo({ "README.md": `Built for ${term}.\n` });
  assert.equal(check(repo).status, 0);
  const denyFile = join(mkdtempSync(join(tmpdir(), "standalone-deny-")), "terms.txt");
  writeFileSync(denyFile, `# internal code names\n\n\\bProject Nightjar\\b\n`);
  const result = check(repo, "--deny-file", denyFile);
  assert.equal(result.status, 1);
  assert.ok(result.stdout.includes(`README.md:1: denied-term "${term}"`), result.stdout);
});

test("binary files are skipped", () => {
  const repo = makeRepo({ "blob.bin": Buffer.from([0, 1, 2, ...Buffer.from(` ${MAC_PATH} `)]) });
  assert.equal(check(repo).status, 0);
});

test("a check that cannot run exits 2 and says why on stderr", () => {
  const repo = makeRepo({ "README.md": "Fine.\n" });
  for (const args of [["--no-such-option"], ["--deny-file", join(repo, "missing.txt")], ["--changed"]]) {
    const result = check(repo, ...args);
    assert.equal(result.status, 2, args.join(" "));
    assert.match(result.stderr, /standalone check: /);
    assert.equal(result.stdout, "");
  }
  const notARepo = mkdtempSync(join(tmpdir(), "standalone-plain-"));
  assert.equal(check(notARepo).status, 2);
});
