import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Failure } from "../src/domain/failure.ts";
import { identifyConnection, MONITORING_IDENTITY, MONITORING_TOOLS, parseConnectorOffers } from "../src/domain/connection.ts";
import { ADDITIONAL_PERMISSIONS, classifyInstructions, instructionsMessage, instructionsVersionOf, lineDiff, needsOwner, parseInstructionsCatalogue, permissionChange, UPGRADE_GRANT, upgradeAuthority, type InstructionsCatalogue } from "../src/domain/instructions.ts";
import { isNewerVersion, parseLock, type LockRow } from "../src/domain/lock.ts";
import type { Download } from "../src/install/install.ts";
import { classifyRoutine, parseTemplateRoutines, routineMessage, type BotRoutine, type TemplateRoutine } from "../src/domain/routines.ts";
import { decideSkillWrite, parseSkillOffers, skillChange, templateVersionOf, withTemplateBodies } from "../src/domain/skill-version.ts";
import { INSTALLER_PIN_TOKEN, parseTemplateSkills, withInstallerPin } from "../src/domain/template-skills.ts";
import { foldWhitespace } from "../src/domain/whitespace.ts";
import { checkInstructions, proposedInstructionsPath } from "../src/install/instructions.ts";
import { templateNote, templateStatus } from "../src/install/newer-template.ts";
import { latestInstallerVersion, releaseDownload, type Fetchers } from "../src/install/release.ts";
import { checkRoutines } from "../src/install/routines.ts";
import { placeSkillFiles, skillsDirectory } from "../src/install/skill-files.ts";
import type { RunTool } from "../src/install/runtime.ts";
import { summaryOf, sync, type ModuleReport, type SyncRequest } from "../src/install/sync.ts";
import { fixturesDirectory, parseTemplateFiles, placeTemplateFiles, templateDirectory } from "../src/install/template-files.ts";
import { fingerprintOf } from "../src/install/text-file.ts";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const fakeModule = (module: string, version: string, problems: readonly string[] = []): string => `#!/usr/bin/env node
(async () => {
  const { createHash } = await import("node:crypto");
  const { readFileSync, realpathSync } = await import("node:fs");
  const path = realpathSync(process.argv[1]);
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  const meta = { now: "2026-01-01T00:00:00.000Z", seed: 0, version: ${JSON.stringify(version)} };
  const data = { binary: { path, sha256 }, problems: ${JSON.stringify(problems)} };
  process.stdout.write(JSON.stringify({ ok: true, schemaVersion: 1, module: ${JSON.stringify(module)}, command: "selfcheck", data, errors: [], meta }) + "\\n");
})();
`;

type Published = { readonly module: string; readonly version: string; readonly kind: "mjs" | "pyz"; readonly content: string };

const published = (module: string, version: string, kind: "mjs" | "pyz" = "mjs", problems: readonly string[] = []): Published => ({
  module,
  version,
  kind,
  content: fakeModule(module, version, problems),
});

const assetOf = ({ module, version, kind }: Published): string => `ambitious-${module}-${version}.${kind}`;
const tagOf = ({ module, version }: Published): string => `${module}-v${version}`;

const rowOf = (release: Published, pin = sha256(release.content)): LockRow => {
  const [row] = parseLock([
    { module: release.module, version: release.version, url: `https://github.com/example/ambitious-${release.module}/releases/download/${tagOf(release)}/${assetOf(release)}`, sha256: pin },
  ]);
  if (row === undefined) throw new Error("the lock has no row");
  return row;
};

const scratch = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-kit-sync-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
};

const mirrorOf = (t: TestContext, releases: readonly Published[]): string => {
  const mirror = scratch(t);
  for (const release of releases) {
    mkdirSync(join(mirror, tagOf(release)), { recursive: true });
    writeFileSync(join(mirror, tagOf(release), assetOf(release)), release.content);
    writeFileSync(join(mirror, tagOf(release), "SHA256SUMS"), `${sha256(release.content)}  ${assetOf(release)}\n`);
  }
  return mirror;
};

const nothingToDownload: Download = () => Promise.reject(new Error("nothing may be downloaded in this run"));

const requestFor = (home: string, rows: readonly LockRow[], mirror: string | null, python: string | null = process.execPath): SyncRequest => ({
  rows,
  home,
  sourceFor: (row) => (mirror === null ? nothingToDownload : releaseDownload(row, mirror)),
  runtimes: { node: process.execPath, python: () => python },
  environment: { ...process.env, AMBITIOUS_HOME: home },
});

const states = (reports: readonly ModuleReport[]): Readonly<Record<string, string>> =>
  Object.fromEntries(reports.map((report) => [report.module, `${report.state}, selfcheck ${report.selfcheck}`]));

const TASKS = published("tasks", "0.3.1");
const VIDEO = published("video", "0.1.0", "pyz");

test("a fresh home gets every pinned module installed and selfchecked, and a second run downloads and changes nothing", async (t) => {
  const home = scratch(t);
  const rows = [rowOf(TASKS), rowOf(VIDEO)];
  const first = await sync(requestFor(home, rows, mirrorOf(t, [TASKS, VIDEO])));
  assert.deepEqual(states(first), { tasks: "installed, selfcheck ok", video: "installed, selfcheck ok" });
  assert.deepEqual(first.flatMap((report) => report.problems), []);
  assert.equal(readlinkSync(join(home, "bin", "ambitious-tasks")), assetOf(TASKS));
  const again = await sync(requestFor(home, rows, null));
  assert.deepEqual(states(again), { tasks: "unchanged, selfcheck ok", video: "unchanged, selfcheck ok" });
});

test("a module whose binary was removed, whose binary was altered or whose link was removed is installed again", async (t) => {
  const home = scratch(t);
  const rows = [rowOf(TASKS), rowOf(VIDEO)];
  const mirror = mirrorOf(t, [TASKS, VIDEO]);
  const bin = join(home, "bin");
  await sync(requestFor(home, rows, mirror));
  const damage: readonly (() => void)[] = [
    () => rmSync(join(bin, assetOf(TASKS))),
    () => writeFileSync(join(bin, assetOf(TASKS)), "altered"),
    () => rmSync(join(bin, "ambitious-tasks")),
    () => writeFileSync(join(bin, "SHA256SUMS"), ""),
  ];
  for (const harm of damage) {
    harm();
    assert.equal(states(await sync(requestFor(home, rows, mirror))).tasks, "reinstalled, selfcheck ok");
    assert.equal(readFileSync(join(bin, assetOf(TASKS)), "utf8"), TASKS.content);
    assert.equal(readlinkSync(join(bin, "ambitious-tasks")), assetOf(TASKS));
    assert.deepEqual(states(await sync(requestFor(home, rows, null))), { tasks: "unchanged, selfcheck ok", video: "unchanged, selfcheck ok" });
  }
});

test("a moved pin upgrades the module, and the old version stays beside the new one", async (t) => {
  const home = scratch(t);
  const next = published("tasks", "0.4.0");
  const mirror = mirrorOf(t, [TASKS, next, VIDEO]);
  const bin = join(home, "bin");
  await sync(requestFor(home, [rowOf(TASKS), rowOf(VIDEO)], mirror));
  const upgraded = await sync(requestFor(home, [rowOf(next), rowOf(VIDEO)], mirror));
  assert.deepEqual(states(upgraded), { tasks: "upgraded, selfcheck ok", video: "unchanged, selfcheck ok" });
  assert.equal(readlinkSync(join(bin, "ambitious-tasks")), assetOf(next));
  assert.equal(readFileSync(join(bin, assetOf(TASKS)), "utf8"), TASKS.content);

  const rebuilt = { ...next, content: `${next.content}\n` };
  const rebuiltMirror = mirrorOf(t, [rebuilt]);
  assert.equal(states(await sync(requestFor(home, [rowOf(rebuilt)], rebuiltMirror))).tasks, "upgraded, selfcheck ok");
  assert.equal(readFileSync(join(bin, assetOf(next)), "utf8"), rebuilt.content);
});

test("an upgrade that fails verification leaves the working version linked and does not stop the other modules", async (t) => {
  const home = scratch(t);
  const next = published("tasks", "0.4.0");
  const mirror = mirrorOf(t, [TASKS, next, VIDEO]);
  await sync(requestFor(home, [rowOf(TASKS)], mirror));
  const cases: readonly (readonly [LockRow, RegExp])[] = [
    [rowOf(next, "0".repeat(64)), /pinned checksum/],
    [rowOf(published("tasks", "0.5.0")), /could not be downloaded/],
  ];
  for (const [row, problem] of cases) {
    const [tasks, video] = await sync(requestFor(home, [row, rowOf(VIDEO)], mirror));
    assert.equal(tasks?.state, "failed");
    assert.equal(tasks?.selfcheck, "not run");
    assert.match(tasks?.problems.join(" ") ?? "", problem);
    assert.equal(video?.selfcheck, "ok");
    assert.equal(readlinkSync(join(home, "bin", "ambitious-tasks")), assetOf(TASKS));
    assert.equal(existsSync(join(home, "bin", row.asset)), false);
  }
});

test("a release file that was swapped after the pin was written is refused even when its own checksum list matches it", async (t) => {
  const home = scratch(t);
  const swapped = { ...TASKS, content: fakeModule("tasks", "0.3.1", ["swapped"]) };
  const [report] = await sync(requestFor(home, [rowOf(TASKS)], mirrorOf(t, [swapped])));
  assert.equal(report?.state, "failed");
  assert.equal(existsSync(join(home, "bin", assetOf(TASKS))), false);
});

test("a missing Python is a problem for the Python module only", async (t) => {
  const home = scratch(t);
  const reports = await sync(requestFor(home, [rowOf(TASKS), rowOf(VIDEO)], mirrorOf(t, [TASKS, VIDEO]), null));
  assert.deepEqual(states(reports), { tasks: "installed, selfcheck ok", video: "installed, selfcheck not run" });
  assert.match(reports[1]?.problems.join(" ") ?? "", /Python 3\.13 was not found/);
  assert.match(summaryOf(reports), /Problems with ambitious-video/);
});

test("what a module's selfcheck reports, and a binary that is not the pinned module, become that module's problems", async (t) => {
  const home = scratch(t);
  const unwell = published("records", "0.1.0", "mjs", ["The database failed its integrity check."]);
  const impostor = { ...published("audit", "0.1.0"), content: fakeModule("other", "0.1.0") };
  const silent = { ...published("contracts", "0.1.0"), content: "#!/usr/bin/env node\n" };
  const reports = await sync(requestFor(home, [rowOf(unwell), rowOf(impostor), rowOf(silent)], mirrorOf(t, [unwell, impostor, silent])));
  assert.deepEqual(states(reports), { records: "installed, selfcheck problems", audit: "installed, selfcheck problems", contracts: "installed, selfcheck problems" });
  assert.deepEqual(reports[0]?.problems, ["The database failed its integrity check."]);
  assert.match(reports[1]?.problems.join(" ") ?? "", /answers as the module "other"/);
  assert.match(reports[2]?.problems.join(" ") ?? "", /did not print a result/);
});

test("the sync refuses the bot's private data directory before touching anything", async () => {
  await assert.rejects(sync(requestFor("/home/box/agent-data/ambitious", [rowOf(TASKS)], null)), (error: unknown) => error instanceof Failure && error.errors[0].code === "E_FORBIDDEN_PATH");
});

test("the summary says in plain words what happened", () => {
  const report = (state: ModuleReport["state"], problems: readonly string[] = []): ModuleReport => ({ module: "tasks", version: "0.1.0", state, selfcheck: problems.length === 0 ? "ok" : "problems", problems });
  assert.equal(summaryOf([]), "No modules are pinned, so nothing was installed or checked.");
  assert.equal(summaryOf([report("unchanged"), report("unchanged"), report("upgraded")]), "3 modules checked: 1 upgraded, 2 unchanged. Every selfcheck is ok.");
  assert.equal(summaryOf([report("failed", ["no"])]), "1 module checked: 1 failed. Problems with ambitious-tasks; read data.problems.");
});

test("the lock accepts exact pins and names what is wrong with anything else", () => {
  const good = { module: "tasks", version: "0.1.0", url: "https://example.org/releases/tasks-v0.1.0/ambitious-tasks-0.1.0.mjs", sha256: "0123456789abcdef".repeat(4) };
  assert.deepEqual(parseLock([]), []);
  assert.deepEqual(parseLock([good]), [{ ...good, kind: "mjs", asset: "ambitious-tasks-0.1.0.mjs", tag: "tasks-v0.1.0", release: "https://example.org/releases/tasks-v0.1.0" }]);
  const bad: readonly unknown[] = [
    {},
    [null],
    [good, good],
    [{ ...good, module: "../tasks" }],
    [{ ...good, version: "latest" }],
    [{ ...good, sha256: "A".repeat(64) }],
    [{ ...good, url: good.url.replace("https:", "http:") }],
    [{ ...good, url: `${good.url}?download=1` }],
    [{ ...good, url: good.url.replace("ambitious-tasks", "ambitious-audit") }],
    [{ ...good, url: "https://example.org/ambitious-tasks-0.1.0.mjs" }],
    [{ ...good, url: "https://example.org/releases/..%2F..%2Fetc/ambitious-tasks-0.1.0.mjs" }],
    [{ ...good, url: "https://example.org/releases/../ambitious-tasks-0.1.0.mjs" }],
    [{ ...good, extra: true }],
    [{ module: good.module, version: good.version, url: good.url }],
  ];
  for (const value of bad) {
    assert.throws(() => parseLock(value), (error: unknown) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA", JSON.stringify(value));
  }
});

test("a .pyz pin may add the checksum of its runtime lock, and the runtime is built only for the module sync was asked to build it for", async (t) => {
  const solver = published("solver", "0.1.0", "pyz");
  const lockText = `engine==1.2.3 --hash=sha256:${"a".repeat(64)}\n`;
  const lockAsset = "ambitious-solver-0.1.0.runtime.txt";
  const url = `https://github.com/example/ambitious-solver/releases/download/${tagOf(solver)}/${assetOf(solver)}`;
  const pin = { module: "solver", version: "0.1.0", url, sha256: sha256(solver.content) };
  const [row] = parseLock([{ ...pin, runtimeSha256: sha256(lockText) }]);
  if (row === undefined) throw new Error("the lock has no row");
  assert.equal(row.runtimeSha256, sha256(lockText));
  assert.equal(Object.hasOwn(parseLock([pin])[0] ?? {}, "runtimeSha256"), false, "a pin without one says nothing about a runtime");
  const tasksUrl = "https://example.org/releases/tasks-v0.1.0/ambitious-tasks-0.1.0.mjs";
  for (const bad of [[{ ...pin, runtimeSha256: "A".repeat(64) }], [{ ...pin, runtimeSha256: 7 }], [{ module: "tasks", version: "0.1.0", url: tasksUrl, sha256: "0".repeat(64), runtimeSha256: "0".repeat(64) }]]) {
    assert.throws(() => parseLock(bad), (error: unknown) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA", JSON.stringify(bad));
  }

  const mirror = mirrorOf(t, [solver, TASKS]);
  writeFileSync(join(mirror, tagOf(solver), lockAsset), lockText);
  writeFileSync(join(mirror, tagOf(solver), "SHA256SUMS"), `${sha256(solver.content)}  ${assetOf(solver)}\n${sha256(lockText)}  ${lockAsset}\n`);
  const calls: string[][] = [];
  const runTool: RunTool = (program, args) => {
    calls.push([program, ...args]);
    if (args[1] === "venv") mkdirSync(join(args[2] ?? "", "bin"), { recursive: true });
    return Promise.resolve();
  };
  const home = scratch(t);
  const rows = [row, rowOf(TASKS)];
  const runtimes = join(home, "solver", "runtime");

  const plain = await sync(requestFor(home, rows, mirror));
  assert.deepEqual(states(plain), { solver: "installed, selfcheck ok", tasks: "installed, selfcheck ok" });
  assert.deepEqual([calls, existsSync(runtimes), plain.some((report) => Object.hasOwn(report, "runtime"))], [[], false, false], "a plain sync builds no runtime and reports none");

  const other = await sync({ ...requestFor(home, rows, mirror), pinnedRuntime: { module: "tasks", runTool } });
  assert.deepEqual([calls, existsSync(runtimes), other.some((report) => Object.hasOwn(report, "runtime"))], [[], false, false], "asking for a module that pins no runtime builds none");

  const moved = await sync({ ...requestFor(home, [{ ...row, runtimeSha256: "d".repeat(64) }, rowOf(TASKS)], mirror), pinnedRuntime: { module: "solver", runTool } });
  assert.match(moved[0]?.problems.join(" ") ?? "", /but the pinned checksum is d{64}\. The release and the pin disagree, so no runtime was built\./);
  assert.deepEqual([calls, existsSync(runtimes), moved[0]?.selfcheck, moved[0]?.state], [[], false, "ok", "unchanged"], "a runtime lock that is not the pinned one is never built, and the module stays installed with its own selfcheck ok");

  const asked = await sync({ ...requestFor(home, rows, mirror), pinnedRuntime: { module: "solver", runTool } });
  assert.deepEqual(states(asked), { solver: "unchanged, selfcheck ok", tasks: "unchanged, selfcheck ok" });
  assert.deepEqual(asked[0]?.runtime, { action: "installed", lock: lockAsset, lockSha256: sha256(lockText), path: join(runtimes, sha256(lockText)) });
  assert.equal(Object.hasOwn(asked[1] ?? {}, "runtime"), false);
  assert.deepEqual(calls.map((call) => call.slice(1, 3).join(" ")), ["-m venv", "-m pip"]);
  assert.equal(calls[0]?.[0], process.execPath, "the runtime is built by the same Python the module will run with");
  assert(calls[1]?.includes("--require-hashes") === true && calls[1].includes("--no-deps"));

  const withoutPython = await sync({ ...requestFor(scratch(t), rows, mirror, null), pinnedRuntime: { module: "solver", runTool } });
  assert.deepEqual([withoutPython[0]?.state, withoutPython[0]?.selfcheck, Object.hasOwn(withoutPython[0] ?? {}, "runtime"), calls.length], ["installed", "not run", false, 2], "without Python no runtime is built");
  assert.equal(withoutPython[0]?.problems.filter((problem) => /^The pinned runtime was not built: Python 3\.13 was not found/.test(problem)).length, 1, "and the run says so as a problem of its own, beside the module's");
  assert.equal(withoutPython[0]?.problems.length, 2);

  const again = await sync({ ...requestFor(home, rows, null), pinnedRuntime: { module: "solver", runTool } });
  assert.deepEqual([again[0]?.runtime?.action, calls.length], ["unchanged", 2], "asking again downloads and builds nothing");
});

test("versions compare by their numbers, and a pre-release is older than its release", () => {
  assert.equal(isNewerVersion("0.2.0", "0.1.9"), true);
  assert.equal(isNewerVersion("0.10.0", "0.9.0"), true);
  assert.equal(isNewerVersion("1.0.0", "1.0.0"), false);
  assert.equal(isNewerVersion("0.1.9", "0.2.0"), false);
  assert.equal(isNewerVersion("1.0.0", "1.0.0-rc.1"), true);
  assert.equal(isNewerVersion("1.0.0-rc.1", "1.0.0"), false);
});

const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

const fetchersOf = (overrides: Partial<Fetchers>, calls: string[] = []): Fetchers => ({
  web: (url) => {
    calls.push(`web ${url}`);
    return Promise.reject(new Error("the server answered 404"));
  },
  gh: (args) => {
    calls.push(`gh ${args.join(" ")}`);
    return Promise.reject(new Error("the GitHub CLI (gh) is not installed"));
  },
  webLatestTag: () => Promise.reject(new Error("the server answered 404")),
  ...overrides,
});

test("a release is read from the web first, then through the GitHub CLI, and a mirror replaces both", async (t) => {
  const address = { release: "https://github.com/example/ambitious-tasks/releases/download/tasks-v0.3.1", tag: "tasks-v0.3.1" };
  const calls: string[] = [];
  const viaGh = releaseDownload(address, null, fetchersOf({ gh: (args) => (calls.push(`gh ${args.join(" ")}`), Promise.resolve(bytes("from gh"))) }, calls));
  assert.equal(new TextDecoder().decode(await viaGh("SHA256SUMS")), "from gh");
  assert.deepEqual(calls, [
    "web https://github.com/example/ambitious-tasks/releases/download/tasks-v0.3.1/SHA256SUMS",
    "gh release download tasks-v0.3.1 --repo example/ambitious-tasks --pattern SHA256SUMS --output -",
  ]);
  await assert.rejects(releaseDownload(address, null, fetchersOf({}))("SHA256SUMS"), /the server answered 404, and the GitHub CLI \(gh\) is not installed/);

  const elsewhere: string[] = [];
  await assert.rejects(releaseDownload({ release: "https://example.org/releases/tasks-v0.3.1", tag: "tasks-v0.3.1" }, null, fetchersOf({}, elsewhere))("SHA256SUMS"), /404/);
  assert.deepEqual(elsewhere, ["web https://example.org/releases/tasks-v0.3.1/SHA256SUMS"]);

  const offline: string[] = [];
  const fromMirror = releaseDownload(address, mirrorOf(t, [TASKS]), fetchersOf({}, offline));
  assert.equal(new TextDecoder().decode(await fromMirror(assetOf(TASKS))), TASKS.content);
  assert.deepEqual(offline, []);
  assert.throws(() => releaseDownload(address, "/home/box/agent-data/mirror"), Failure);
});

test("the latest template release is found in a mirror, on the web or through the GitHub CLI", async (t) => {
  const mirror = scratch(t);
  assert.equal(await latestInstallerVersion(mirror), null);
  for (const version of ["0.2.0", "0.10.0", "0.9.1"]) {
    mkdirSync(join(mirror, `kit-v${version}`));
    writeFileSync(join(mirror, `kit-v${version}`, `ambitious-modules-${version}.mjs`), "");
  }
  mkdirSync(join(mirror, "kit-v9.0.0"));
  assert.equal(await latestInstallerVersion(mirror), "0.10.0");
  assert.equal(await latestInstallerVersion(null, fetchersOf({ webLatestTag: () => Promise.resolve("kit-v0.3.0") })), "0.3.0");
  assert.equal(await latestInstallerVersion(null, fetchersOf({ gh: () => Promise.resolve(bytes("kit-v0.4.0\n")) })), "0.4.0");
  await assert.rejects(latestInstallerVersion(null, fetchersOf({ webLatestTag: () => Promise.resolve("nightly") })), /not a template release/);
  await assert.rejects(latestInstallerVersion(null, fetchersOf({})), /404/);
});

const TRAP = "#!/usr/bin/env node\nprocess.stdout.write('a tampered installer ran');\n";

test("a newer template release is only reported: nothing of it is read, installed or run, even when its own checksum list matches it", async (t) => {
  const home = scratch(t);
  const mirror = scratch(t);
  mkdirSync(join(mirror, "kit-v0.3.0"));
  writeFileSync(join(mirror, "kit-v0.3.0", "ambitious-modules-0.3.0.mjs"), TRAP);
  writeFileSync(join(mirror, "kit-v0.3.0", "SHA256SUMS"), `${sha256(TRAP)}  ambitious-modules-0.3.0.mjs\n`);
  assert.deepEqual(await templateStatus("0.3.0", mirror), { update: "current" });
  assert.deepEqual(await templateStatus("0.4.0", mirror), { update: "current" });
  const status = await templateStatus("0.2.0", mirror);
  assert.deepEqual(status, { update: "available", latest: "0.3.0" });
  assert.match(templateNote("0.2.0", status) ?? "", /newer template is available: release 0\.3\.0.*Update the bot's template to get it\. Nothing from the newer release was downloaded, installed or run\./);
  assert.equal(templateNote("0.3.0", { update: "current" }), null);
  assert.equal(existsSync(join(home, "bin")), false);

  const calls: string[] = [];
  const online = await templateStatus("0.2.0", null, fetchersOf({ webLatestTag: (repository) => (calls.push(`latest ${repository}`), Promise.resolve("kit-v0.3.0")) }, calls));
  assert.deepEqual(online, { update: "available", latest: "0.3.0" });
  assert.deepEqual(calls, ["latest AmbitiousBots/ambitious-kit"]);
});

test("a check for a newer template that cannot be made is a note about the check, and the installer's own pins stay in use", async () => {
  const status = await templateStatus("0.2.0", null, fetchersOf({}));
  assert.equal(status.update, "not checked");
  assert.match(templateNote("0.2.0", status) ?? "", /Could not look for a newer template release: .*404.*The pins that came with this installer were used\./);
});

test("the template's files are written under template in the home, the fixtures under template/fixtures, once, and never under the private data directory", (t) => {
  const home = scratch(t);
  const files = parseTemplateFiles({ "fixtures/probe/owner.expected.json": "[1]\n", "notes.txt": "plain\n" });
  const root = placeTemplateFiles(home, files);
  assert.equal(root, templateDirectory(home));
  assert.equal(fixturesDirectory(home), join(home, "template", "fixtures"));
  assert.equal(readFileSync(join(home, "template", "fixtures", "probe", "owner.expected.json"), "utf8"), "[1]\n");
  writeFileSync(join(root, "notes.txt"), "altered");
  placeTemplateFiles(home, files);
  assert.equal(readFileSync(join(root, "notes.txt"), "utf8"), "plain\n");
  assert.throws(() => placeTemplateFiles("/home/box/agent-data/ambitious", files), Failure);
  for (const bad of [{ "../escape.json": "x" }, { "/absolute.json": "x" }, { "a/../../b.json": "x" }, { "ok.json": 7 }, []]) {
    assert.throws(() => parseTemplateFiles(bad), JSON.stringify(bad));
  }
});

test("template file writes refuse symlinked targets even when their content already matches", (t) => {
  for (const outsideBytes of ["published text", "outside bytes"]) {
    const home = scratch(t);
    const files = parseTemplateFiles({ "notes.txt": "published text" });
    const root = placeTemplateFiles(home, files);
    const outside = join(home, "outside");
    writeFileSync(outside, outsideBytes);
    rmSync(join(root, "notes.txt"));
    symlinkSync(outside, join(root, "notes.txt"));
    assert.throws(() => placeTemplateFiles(home, files), (error) => error instanceof Failure && error.errors[0].code === "E_INSTALL_PATH");
    assert.equal(readFileSync(outside, "utf8"), outsideBytes);
    assert.equal(readlinkSync(join(root, "notes.txt")), outside);
  }
});

test("a shared skill is written only when none is stored or the stored one is older; identical text is left alone and a newer one is never replaced", () => {
  const body = (version: string, text = "Do the thing."): string => `Template version: ${version}\n\n# Skill\n\n${text}\n`;
  const decide = (stored: string | null, candidate: string): string => decideSkillWrite({ name: "ambitious-example", stored, candidate }).action;
  assert.equal(templateVersionOf(body("0.2.2")), "0.2.2");
  assert.equal(templateVersionOf("# Skill\n\nTemplate version: 0.2.2\n"), null);
  assert.equal(decide(null, body("0.2.2")), "create");
  assert.equal(decide(body("0.2.2"), body("0.2.2")), "unchanged");
  assert.equal(decide(body("0.2.1"), body("0.2.2")), "update");
  assert.equal(decide(body("0.9.0"), body("0.10.0")), "update");
  assert.equal(decide("# Skill\n\nFrom before skills carried a version.\n", body("0.2.2")), "update");

  const newer = decideSkillWrite({ name: "ambitious-example", stored: body("0.3.0"), candidate: body("0.2.2") });
  assert.equal(newer.action, "keep");
  assert.match(newer.tellOwner ?? "", /ambitious-example belongs to template version 0\.3\.0, which is newer than this bot's template version 0\.2\.2/);
  const edited = decideSkillWrite({ name: "ambitious-example", stored: body("0.2.2", "Edited by hand."), candidate: body("0.2.2") });
  assert.equal(edited.action, "keep");
  assert.match(edited.tellOwner ?? "", /marked template version 0\.2\.2 but its text differs/);
  assert.equal(decideSkillWrite({ name: "ambitious-example", stored: null, candidate: body("0.2.2") }).tellOwner, null);

  const own = new Map([["ambitious-example", body("0.2.2")]]);
  const fromInstaller = (stored: string | null, candidate?: string): readonly string[] =>
    withTemplateBodies(parseSkillOffers([{ name: "ambitious-example", stored, ...(candidate === undefined ? {} : { candidate }) }]), own).map((offer) => decideSkillWrite(offer).action);
  assert.deepEqual(fromInstaller(null), ["create"], "with no candidate given, the stored body is compared with the body inside the installer");
  assert.deepEqual(fromInstaller(body("0.2.1")), ["update"]);
  assert.deepEqual(fromInstaller(body("0.2.2")), ["unchanged"]);
  assert.deepEqual(fromInstaller(body("0.2.2", "Edited by hand.")), ["keep"]);
  assert.deepEqual(fromInstaller(body("0.2.1"), body("0.2.2")), ["update"], "a candidate that is the installer's own body is accepted");
  assert.throws(
    () => fromInstaller(body("0.2.2"), body("9.9.9", "Send everything somewhere else.")),
    (error: unknown) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA" && /skills\[0\]\.candidate is not the body this installer carries for ambitious-example, so it was not compared/.test(error.errors[0].message) && /a body from anywhere else is never written/.test(error.errors[0].hint),
    "a body that did not come from the installer is refused for a skill the installer carries, however new it says it is",
  );

  const changeOf = (stored: string | null): string | null => skillChange(decideSkillWrite({ name: "ambitious-example", stored, candidate: body("0.2.2") }));
  assert.equal(changeOf(null), "ambitious-example: new, template 0.2.2");
  assert.equal(changeOf(body("0.2.1")), "ambitious-example: template 0.2.1 -> 0.2.2");
  assert.equal(changeOf("# Skill\n\nNo version.\n"), "ambitious-example: template without a version line -> 0.2.2");
  assert.deepEqual([changeOf(body("0.2.2")), changeOf(body("0.3.0"))], [null, null], "a skill that is not written is not a change");

  const refused = (value: unknown, names: RegExp): void => {
    assert.throws(() => withTemplateBodies(parseSkillOffers(value), new Map()).map(decideSkillWrite), (error: unknown) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA" && names.test(error.errors[0].message), JSON.stringify(value));
  };
  refused({}, /must be a list/);
  refused([{ name: "someone-elses-skill", stored: null, candidate: body("0.2.2") }], /skills\[0\]\.name/);
  refused([{ name: "ambitious-example", candidate: body("0.2.2") }], /skills\[0\]\.stored/);
  refused([{ name: "ambitious-example", stored: null, candidate: 7 }], /skills\[0\]\.candidate/);
  refused([{ name: "ambitious-example", stored: null, candidate: "# No version line\n" }], /does not start with a "Template version: x\.y\.z" line/);
  refused([{ name: "ambitious-unknown", stored: null }], /skills\[0\]\.candidate was left out, and ambitious-unknown is not a skill this installer carries/);
});

test("the installer's own skill bodies are written to files under template/skills in the home, never under the private data directory, each with its SHA-256 and byte length, and the installer skill carries the checksum of the installer that wrote it", (t) => {
  const home = scratch(t);
  const pin = "a".repeat(64);
  const embedded = parseTemplateSkills([
    { name: "ambitious-module-installer", description: "Installs.", body: `Template version: 0.2.2\n\necho "${INSTALLER_PIN_TOKEN}  ambitious-modules-0.2.2.mjs" | sha256sum -c -\n` },
    { name: "ambitious-example", description: "An example.", body: "Template version: 0.2.2\n\nCaf\u00e9, exactly as written.\n" },
  ]);
  const skills = withInstallerPin(embedded, pin);
  assert.equal(skills[0]?.body, `Template version: 0.2.2\n\necho "${pin}  ambitious-modules-0.2.2.mjs" | sha256sum -c -\n`);
  assert.equal(skills[1]?.body, embedded[1]?.body, "no other skill is touched");
  const files = placeSkillFiles(home, skills);
  assert.deepEqual(files.map(({ name, description, path }) => [name, description, path]), [
    ["ambitious-module-installer", "Installs.", join(skillsDirectory(home), "ambitious-module-installer.md")],
    ["ambitious-example", "An example.", join(home, "template", "skills", "ambitious-example.md")],
  ]);
  for (const [index, file] of files.entries()) {
    const written = readFileSync(file.path);
    assert.equal(written.toString("utf8"), skills[index]?.body, "the file holds the body exactly");
    assert.deepEqual([file.sha256, file.bytes], [createHash("sha256").update(written).digest("hex"), written.length]);
  }
  assert.equal(files[1]?.bytes, (skills[1]?.body.length ?? 0) + 1, "the length is counted in bytes, not characters");
  writeFileSync(files[1]?.path ?? "", "altered");
  assert.deepEqual(placeSkillFiles(home, skills), files, "a second run puts an altered file back and gives the same answer");
  assert.equal(readFileSync(files[1]?.path ?? "", "utf8"), skills[1]?.body);
  assert.throws(() => placeSkillFiles("/home/box/agent-data/ambitious", skills), (error: unknown) => error instanceof Failure && error.errors[0].code === "E_FORBIDDEN_PATH");
  for (const bad of [{}, [{ name: "someone-elses-skill", description: "x", body: "x" }], [{ name: "ambitious-a", description: "x", body: "" }], [{ name: "ambitious-a", body: "x" }]]) {
    assert.throws(() => parseTemplateSkills(bad), /embedded template skill/, JSON.stringify(bad));
  }
});

const instructionsOf = (version: number, body: string): string => `Instructions version: ${version}\n\n# Role\n\n${body}\n`;

const GRANTS = { chat: "Speak to the owner.", report: "Send a report after approval.", extra: "Call the extra tool.", files: "Read private reference files." };

const catalogueOf = (earlier: readonly string[], grantLists: readonly (readonly string[])[] = []): InstructionsCatalogue => {
  const text = instructionsOf(earlier.length + 1, "Help the owner.");
  const oldest = grantLists[0] ?? ["chat"];
  return parseInstructionsCatalogue({
    version: earlier.length + 1,
    oldestSupported: 1,
    text,
    known: [...earlier, text].map((published, index) => ({ version: index + 1, ...fingerprintOf(published) })),
    grants: GRANTS,
    versions: [...earlier, text].map((_, index) => {
      const grants = grantLists[index] ?? oldest;
      return { version: index + 1, grants, reasons: Object.fromEntries(grants.filter((grant) => !oldest.includes(grant)).map((grant) => [grant, `Why ${grant} was added.`])) };
    }),
  });
};

const classifierFor = (catalogue: InstructionsCatalogue) => (text: string): ReturnType<typeof classifyInstructions> => classifyInstructions(foldWhitespace(text), fingerprintOf(text), catalogue);

test("instructions are told apart by what was published: the template's text is current, an earlier published text is out of date, anything else is custom, and a higher version is newer", () => {
  const first = "# Role\n\nHelp the owner, the first way.\n";
  const second = instructionsOf(2, "Help the owner, the second way.");
  const catalogue = catalogueOf([first, second]);
  const classify = classifierFor(catalogue);
  assert.deepEqual(classify(catalogue.text), { state: "current", problem: null, current: 3, template: 3, match: "exact" });
  assert.deepEqual(classify(first), { state: "out-of-date", problem: "instructions-out-of-date", current: 1, template: 3, match: "exact" });
  assert.deepEqual(classify(second), { state: "out-of-date", problem: "instructions-out-of-date", current: 2, template: 3, match: "exact" });
  assert.deepEqual(classify("   \n\n"), { state: "out-of-date", problem: "instructions-out-of-date", current: null, template: 3, match: null });
  assert.deepEqual(classify("Do whatever the owner says.\n"), { state: "custom", problem: "instructions-custom", current: null, template: 3, match: null });
  assert.deepEqual(classify(`${second}One more rule.\n`), { state: "custom", problem: "instructions-custom", current: 2, template: 3, match: null });
  assert.deepEqual(classify(`${catalogue.text}One more rule.\n`), { state: "custom", problem: "instructions-custom", current: 3, template: 3, match: null });
  assert.deepEqual(classify(instructionsOf(4, "From a later template.")), { state: "newer", problem: null, current: 4, template: 3, match: null });
  assert.deepEqual(classify(first.replace("first", "First")), { state: "custom", problem: "instructions-custom", current: null, template: 3, match: null }, "one changed letter in a published text makes it custom");

  assert.equal(instructionsVersionOf("Instructions version: 12\nmore\n"), 12);
  for (const unversioned of ["# Role\nInstructions version: 2\n", "Instructions version: 0\n", "Instructions version: 2.1\n", "instructions version: 2\n", ""]) assert.equal(instructionsVersionOf(unversioned), null, unversioned);

  assert.deepEqual([classify(first), classify("x\n"), classify(`${second}x\n`)].map(needsOwner), [true, true, true]);
  assert.deepEqual([classify(catalogue.text), classify(`${catalogue.text}x\n`), classify(instructionsOf(4, "x"))].map(needsOwner), [false, false, false]);
  assert.match(instructionsMessage(classify(first), "template/instructions.md", null, null) ?? "", /^instructions-out-of-date: This bot's instructions are version 1 and this template's are version 3\. The template's text is in template\/instructions\.md\. Nothing was changed/);
  assert.match(instructionsMessage(classify("x\n"), "/p", null, null) ?? "", /^instructions-custom: .*carry no version line, and this template's are version 3.*left as they are/);
  assert.match(instructionsMessage(classify(`${second}x\n`), "/p", null, null) ?? "", /^instructions-custom: .*they say version 2/);
  assert.equal(instructionsMessage(classify(catalogue.text), "/p", null, null), null);

  const behind = { own: "0.2.2", latest: "0.3.0" };
  const midUpgrade = /The template's text is in \/p\. A newer template, release 0\.3\.0, is available, and this installer is 0\.2\.2\. The newer template may carry a different instructions text, which may allow fewer things than this one\. Update the template first, then check the instructions again and propose the text the newer template carries\./;
  assert.match(instructionsMessage(classify(first), "/p", null, behind) ?? "", midUpgrade, "an installer that is itself behind says so in the instructions problem");
  assert.match(instructionsMessage(classify("x\n"), "/p", null, behind) ?? "", midUpgrade);
  assert.equal(instructionsMessage(classify(catalogue.text), "/p", null, behind), null, "instructions that are the template's are no problem, whatever else is available");
  assert.doesNotMatch(instructionsMessage(classify(`${catalogue.text}x\n`), "/p", null, behind) ?? "", /newer template/, "a note about a customised present text proposes nothing, so it carries no advice about order");

  const valid = { version: 1, oldestSupported: 1, text: instructionsOf(1, "x"), known: [], grants: GRANTS, versions: [{ version: 1, grants: ["chat"], reasons: {} }] };
  assert.equal(parseInstructionsCatalogue(valid).version, 1);
  const hash = "0".repeat(64);
  for (const bad of [
    null,
    { ...valid, version: 0 },
    { ...valid, version: 2, text: instructionsOf(3, "x") },
    { ...valid, text: `${instructionsOf(1, "x")}\n` },
    { ...valid, oldestSupported: 2 },
    { ...valid, known: [{ version: 2, sha256: hash, whitespaceSha256: hash }] },
    { ...valid, known: [{ version: 1, sha256: "short", whitespaceSha256: hash }] },
    { ...valid, known: [{ version: 1, sha256: hash }] },
    { ...valid, grants: { chat: "" } },
    { ...valid, versions: [] },
    { ...valid, versions: [{ version: 1, grants: ["undescribed"], reasons: {} }] },
    { ...valid, versions: [{ version: 1, grants: ["chat"] }] },
  ]) {
    assert.throws(() => parseInstructionsCatalogue(bad), /embedded instructions catalogue/, JSON.stringify(bad));
  }
});

test("a published text that differs only in whitespace is recognised and reported as a whitespace match; any other difference makes it custom", () => {
  const first = "# Role\n\nHelp the owner,  the first way.\nNever send email.\n";
  const catalogue = catalogueOf([first]);
  const classify = classifierFor(catalogue);
  const published = { state: "out-of-date", problem: "instructions-out-of-date", current: 1, template: 2 };
  assert.deepEqual(classify(first), { ...published, match: "exact" });
  const copies = {
    "Windows line endings": first.replaceAll("\n", "\r\n"),
    "old Mac line endings": first.replaceAll("\n", "\r"),
    "trailing spaces and tabs": first.replaceAll("\n", " \t\n"),
    "no final newline": first.trimEnd(),
    "blank lines at both ends": `\n\n${first}\n\n`,
    "a run of blank lines": first.replace("\n\n", "\n\n\n\n"),
    "a blank line dropped": first.replace("\n\n", "\n"),
    "non-breaking spaces": first.replaceAll(" ", "\u00a0"),
    "narrow non-breaking spaces": first.replace("Help the", "Help\u202fthe"),
    "tabs for spaces": first.replaceAll(" ", "\t"),
    "one space for two": first.replace(",  the", ", the"),
    "indented lines": first.replaceAll("\n", "\n  "),
    "a byte order mark": `\ufeff${first}`,
  };
  for (const [what, copy] of Object.entries(copies)) {
    assert.notEqual(copy, first, what);
    assert.deepEqual(classify(copy), { ...published, match: "whitespace" }, what);
  }
  assert.deepEqual(classify(catalogue.text.replaceAll("\n", "\r\n")), { state: "current", problem: null, current: 2, template: 2, match: "whitespace" });
  const changed = {
    "a changed letter": first.replace("first", "First"),
    "a dropped word": first.replace("Never send", "Send"),
    "an added line": `${first}One more rule.\n`,
    "two lines joined": first.replace("way.\nNever", "way. Never"),
    "a line split in two": first.replace("the first", "the\nfirst"),
    "a space inside a word": first.replace("owner", "own er"),
    "a missing space between words": first.replace("the owner", "theowner"),
    "changed punctuation": first.replace("email.", "email!"),
  };
  for (const [what, copy] of Object.entries(changed)) assert.deepEqual(classify(copy), { state: "custom", problem: "instructions-custom", current: null, template: 2, match: null }, what);

  assert.equal(foldWhitespace(" a \t b\u00a0\u00a0c \r\n\r\n\r\n d\u3000e\n"), "a b c\nd e");
  assert.equal(foldWhitespace(" \n\t\n"), "");
});

test("what pasting the template's text would change is said in plain words: additional permissions, permissions taken away, or the same", () => {
  const [first, second] = ["# Role\n\nFirst.\n", instructionsOf(2, "Second.")];
  const adding = catalogueOf([first], [["chat", "report"], ["chat", "report", "extra"]]);
  const more = permissionChange(classifierFor(adding)(first), adding);
  assert.deepEqual(more, {
    comparedWith: "the bot's present text",
    comparison: "more",
    added: [{ grant: "extra", permission: "Call the extra tool.", reason: "Why extra was added." }],
    removed: [],
    statement: "Pasting this text gives the bot these additional permissions: (1) Call the extra tool.",
  });
  assert(more?.statement.startsWith(ADDITIONAL_PERMISSIONS));
  assert.match(instructionsMessage(classifierFor(adding)(first), "/p", more, null) ?? "", /the owner's choice\. Pasting this text gives the bot these additional permissions: \(1\) Call the extra tool\.$/);

  const narrowing = catalogueOf([first, second], [["chat", "report"], ["chat", "report", "extra", "files"], ["chat", "report"]]);
  const fewer = permissionChange(classifierFor(narrowing)(second), narrowing);
  assert.equal(fewer?.comparison, "fewer");
  assert.deepEqual(fewer?.removed.map(({ grant }) => grant), ["extra", "files"]);
  assert.equal(fewer?.statement, "Pasting this text gives the bot no additional permissions. It takes away these permissions: (1) Call the extra tool. (2) Read private reference files.");
  const same = permissionChange(classifierFor(narrowing)(first), narrowing);
  assert.deepEqual([same?.comparison, same?.added, same?.removed], ["same", [], []]);
  assert.equal(same?.statement, "Pasting this text gives the bot no additional permissions and takes none away: it allows the same things as the bot's present text.");
  assert.equal(permissionChange(classifierFor(narrowing)(narrowing.text), narrowing)?.comparison, "same");

  const both = catalogueOf([first], [["chat"], ["chat", "extra"]]);
  const swapped = { ...both, versions: [{ version: 1, grants: ["chat", "files"], reasons: {} }, { version: 2, grants: ["chat", "extra"], reasons: { extra: "Why." } }] };
  const mixed = permissionChange(classifierFor(swapped)(first), swapped);
  assert.equal(mixed?.comparison, "more and fewer");
  assert.equal(mixed?.statement, "Pasting this text gives the bot these additional permissions: (1) Call the extra tool. It takes away these permissions: (1) Read private reference files.");

  const unknown = permissionChange(classifierFor(adding)("Written by hand.\n"), adding);
  assert.equal(unknown?.comparedWith, "the oldest supported text");
  assert.match(unknown?.statement ?? "", /^This bot's present instructions are not a text this template published, so what they allow cannot be compared; the comparison is with the oldest instructions text still supported\. Pasting this text gives the bot these additional permissions: \(1\) Call the extra tool\.$/);
  assert.equal(permissionChange(classifierFor(adding)(""), adding)?.comparedWith, "the oldest supported text");
  assert.equal(permissionChange(classifierFor(adding)(instructionsOf(9, "Later.")), adding), null, "a text newer than this installer knows is not compared");
});

const longestShared = (before: readonly string[], after: readonly string[]): number => {
  const best = (i: number, j: number): number => {
    if (i === before.length || j === after.length) return 0;
    return before[i] === after[j] ? 1 + best(i + 1, j + 1) : Math.max(best(i + 1, j), best(i, j + 1));
  };
  return best(0, 0);
};

const inOrderWithin = (some: readonly string[], all: readonly string[]): boolean => {
  let from = 0;
  return some.every((line) => {
    const at = all.indexOf(line, from);
    from = at + 1;
    return at !== -1;
  });
};

test("an upgrade that writes skills may be asked for by anyone only when the bot's instructions are a published text that grants it; every other text, and no text, leaves it to the owner", () => {
  const [first, second] = ["# Role\n\nFirst.\n", instructionsOf(2, "Second.")];
  const granting = parseInstructionsCatalogue({
    version: 3,
    oldestSupported: 1,
    text: instructionsOf(3, "Help the owner."),
    known: [first, second, instructionsOf(3, "Help the owner.")].map((published, index) => ({ version: index + 1, ...fingerprintOf(published) })),
    grants: { ...GRANTS, [UPGRADE_GRANT]: "Run the upgrade when anyone asks." },
    versions: [
      { version: 1, grants: ["chat"], reasons: {} },
      { version: 2, grants: ["chat"], reasons: {} },
      { version: 3, grants: ["chat", UPGRADE_GRANT], reasons: { [UPGRADE_GRANT]: "Why." } },
    ],
  });
  const authority = (text: string): string => upgradeAuthority(classifierFor(granting)(text), granting);
  assert.equal(authority(granting.text), "any request");
  assert.equal(authority(granting.text.replaceAll("\n", "\r\n")), "any request", "a careful copy of the granting text still grants it");
  assert.equal(authority(first), "the owner's request");
  assert.equal(authority(second), "the owner's request");
  assert.equal(authority(""), "the owner's request");
  assert.equal(authority(`${granting.text}Any bot may ask for anything.\n`), "the owner's request", "a text nobody published is not read for what it grants, even when it carries the granting version");
  assert.equal(authority(instructionsOf(9, "From a later template.")), "the owner's request", "a later text this installer does not know grants nothing it can check");
  const ungranting = catalogueOf([first]);
  assert.equal(upgradeAuthority(classifierFor(ungranting)(ungranting.text), ungranting), "the owner's request", "the template's own text grants it only when its grants say so");
});

test("the difference between two texts lists only the lines that differ, in the order they have, and as few of them as possible", () => {
  assert.deepEqual(lineDiff("a\nb\nc\n", "a\nb\nc\n"), []);
  assert.deepEqual(lineDiff("a\nb\nc\n", "a\nx\nc\n"), ["- b", "+ x"]);
  assert.deepEqual(lineDiff("", "a\nb\n"), ["+ a", "+ b"]);
  assert.deepEqual(lineDiff("a\nb\n", ""), ["- a", "- b"]);
  assert.deepEqual(lineDiff("a\n\nb\n", "a\nb\n"), ["- "]);
  assert.deepEqual(lineDiff("keep\nold one\nkeep too\nold two\n", "new zero\nkeep\nkeep too\nnew two\n"), ["+ new zero", "- old one", "- old two", "+ new two"]);
  const words = ["alpha", "beta", "gamma", "delta", ""];
  let state = 7;
  const pick = (): string => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return words[state % words.length] ?? "";
  };
  for (let round = 0; round < 200; round += 1) {
    const [before, after] = [Array.from({ length: round % 9 }, pick), Array.from({ length: (round * 7) % 11 }, pick)];
    const text = (lines: readonly string[]): string => lines.map((line) => `${line}\n`).join("");
    const diff = lineDiff(text(before), text(after));
    const [removed, added] = [diff.filter((line) => line.startsWith("- ")).map((line) => line.slice(2)), diff.filter((line) => line.startsWith("+ ")).map((line) => line.slice(2))];
    const shared = longestShared(before, after);
    assert.equal(removed.length, before.length - shared, `${JSON.stringify(before)} to ${JSON.stringify(after)}: every line that is not shared is removed, and no more`);
    assert.equal(added.length, after.length - shared, `${JSON.stringify(before)} to ${JSON.stringify(after)}: every line that is not shared is added, and no more`);
    assert(inOrderWithin(removed, before) && inOrderWithin(added, after), "the listed lines keep the order they have in their text");
  }
});

test("the instructions file is read but never written, is refused under the private data directory, and no file means no check", (t) => {
  const home = scratch(t);
  const earlier = "# Role\n\nHelp the owner, the first way.\n";
  const catalogue = catalogueOf([earlier]);
  const file = join(home, "current-instructions.md");
  writeFileSync(file, earlier);
  const report = checkInstructions(file, home, catalogue);
  assert.deepEqual([report.state, report.problem, report.current, report.template, report.match], ["out-of-date", "instructions-out-of-date", 1, 2, "exact"]);
  assert.equal(report.proposed, proposedInstructionsPath(home));
  assert.equal(report.proposed, join(home, "template", "instructions.md"));
  assert.deepEqual(report.diff, ["+ Instructions version: 2", "- Help the owner, the first way.", "+ Help the owner."]);
  assert.equal(report.permissions?.comparison, "same");
  assert.equal(readFileSync(file, "utf8"), earlier);
  writeFileSync(file, earlier.replaceAll("\n", "  \r\n\r\n"));
  const copied = checkInstructions(file, home, catalogue);
  assert.deepEqual([copied.state, copied.current, copied.match, copied.diff], ["out-of-date", 1, "whitespace", report.diff], "a whitespace-only copy gives the same answer and the same diff");
  assert.deepEqual(checkInstructions(null, home, catalogue), { state: "not checked", problem: null, current: null, template: 2, match: null, proposed: report.proposed, diff: [], permissions: null, upgradeOn: "the owner's request" });
  assert.equal(report.upgradeOn, "the owner's request");
  const refused = (path: string, code: string): void => {
    assert.throws(() => checkInstructions(path, home, catalogue), (error: unknown) => error instanceof Failure && error.errors[0].code === code, path);
  };
  refused("/home/box/agent-data/instructions.md", "E_FORBIDDEN_PATH");
  refused(join(home, "missing.md"), "E_INPUT_SCHEMA");
  refused(home, "E_INPUT_SCHEMA");
  writeFileSync(join(home, "huge.md"), "x".repeat(300 * 1024));
  refused(join(home, "huge.md"), "E_INPUT_SCHEMA");
});

const folded = (text: string): string => fingerprintOf(text).whitespaceSha256;

const withDestination = (prompt: string, destination: string): string => `${prompt}\nDestination: ${destination}`;

const templateRoutine = (name: string, prompt: string, earlier: readonly (readonly [string, string, string?])[] = [], paused = false, destination?: string): TemplateRoutine =>
  parseTemplateRoutines([
    {
      name,
      schedule: "every day at 7:00 AM",
      paused,
      prompt,
      ...fingerprintOf(prompt),
      variants: destination === undefined ? [] : [folded(withDestination(prompt, destination))],
      earlier: earlier.flatMap(([template, text, stored]) => [
        { template, whitespaceSha256: folded(text), variant: false },
        ...(stored === undefined ? [] : [{ template, whitespaceSha256: folded(withDestination(text, stored)), variant: true }]),
      ]),
    },
  ])[0] ?? assert.fail("one routine was given");

const mine = (name: string, prompt: string, schedule = "every day at 7:00 AM"): BotRoutine => ({ name, schedule, ...fingerprintOf(prompt) });

test("a routine is compared with the template's by its prompt: the same prompt is current, an earlier template's prompt is out of date, any other is custom, and no routine of that name is missing", () => {
  const [now, before] = ["Run the sync command.\nReply only about problems.", "Run the sync command.\nSay that all is well."];
  const routine = templateRoutine("ambitious-selfcheck", now, [["0.2.1", before]]);
  const about = (bot: readonly BotRoutine[]): readonly unknown[] => {
    const { state, problem, match, publishedIn } = classifyRoutine(routine, bot);
    return [state, problem, match, publishedIn];
  };
  assert.deepEqual(about([mine("ambitious-selfcheck", now)]), ["current", null, "exact", null]);
  assert.deepEqual(about([mine("ambitious-selfcheck", `\r\n${now.replaceAll("\n", " \r\n\r\n").replaceAll(" ", "\u00a0")}\n`)]), ["current", null, "whitespace", null]);
  assert.deepEqual(about([mine("ambitious-selfcheck", before)]), ["out-of-date", "routine-prompt-out-of-date", "whitespace", "0.2.1"]);
  assert.deepEqual(about([mine("ambitious-selfcheck", before.replaceAll(" ", "\t"))]), ["out-of-date", "routine-prompt-out-of-date", "whitespace", "0.2.1"]);
  assert.deepEqual(about([mine("ambitious-selfcheck", now.replace("only", "never"))]), ["custom", "routine-custom", null, null]);
  assert.deepEqual(about([mine("some-other-routine", now)]), ["missing", "routine-missing", null, null]);
  assert.deepEqual(about([]), ["missing", "routine-missing", null, null]);
  assert.deepEqual(about([mine("ambitious-selfcheck", "Written by hand."), mine("ambitious-selfcheck", now)]), ["current", null, "exact", null], "of two routines with the template's name, the one that runs the template's prompt counts");

  const stored = templateRoutine("ambitious-selfcheck", now, [["0.2.1", before, "the owner's chat with this bot"]], false, "the run's reply, in this bot's own chat");
  const aboutStored = (prompt: string): readonly unknown[] => {
    const { state, problem, match, publishedIn } = classifyRoutine(stored, [mine("ambitious-selfcheck", prompt)]);
    return [state, problem, match, publishedIn];
  };
  assert.deepEqual(aboutStored(withDestination(before, "the owner's chat with this bot")), ["out-of-date", "routine-prompt-out-of-date", "variant", "0.2.1"], "an earlier prompt stored with its Destination line added is still that earlier prompt");
  assert.deepEqual(aboutStored(`${before}\r\n\r\nDestination:  the owner's chat with this bot\r\n`), ["out-of-date", "routine-prompt-out-of-date", "variant", "0.2.1"]);
  assert.deepEqual(aboutStored(withDestination(now, "the run's reply, in this bot's own chat")), ["current", null, "variant", null], "and the present prompt stored that way is current");
  assert.deepEqual(aboutStored(withDestination(now, "the team channel")), ["custom", "routine-custom", null, null], "a Destination line no template published makes the prompt custom");
  assert.deepEqual(aboutStored(withDestination(before, "the run's reply, in this bot's own chat")), ["custom", "routine-custom", null, null], "a variant is one recorded text, not any prompt with any published line");
  assert.match(routineMessage(classifyRoutine(stored, [mine("ambitious-selfcheck", withDestination(before, "the owner's chat with this bot"))]), "/p") ?? "", /^routine-prompt-out-of-date: The routine ambitious-selfcheck runs the prompt that template 0\.2\.1 published/);

  const moved = classifyRoutine(routine, [mine("ambitious-selfcheck", now, "every day at 6:30 AM")]);
  assert.deepEqual([moved.state, moved.schedule], ["current", { current: "every day at 6:30 AM", template: "every day at 7:00 AM" }], "a time the owner changed is reported and is not a problem");
  const absent = classifyRoutine(templateRoutine("ambitious-snapshot", now, [], true), []);
  assert.deepEqual([absent.starts, absent.schedule.current, absent.prompt], ["paused", null, now], "the proposal carries the template's prompt and how the routine starts");

  assert.equal(routineMessage(classifyRoutine(routine, [mine("ambitious-selfcheck", now)]), "/p"), null);
  assert.match(routineMessage(classifyRoutine(routine, [mine("ambitious-selfcheck", before)]), "/p") ?? "", /^routine-prompt-out-of-date: The routine ambitious-selfcheck runs the prompt that template 0\.2\.1 published.*This template's prompt is in \/p\. Nothing was changed: a routine's prompt is replaced only when the owner asks for it\.$/);
  assert.match(routineMessage(classifyRoutine(routine, []), "/p") ?? "", /^routine-missing: This bot has no routine named ambitious-selfcheck\..*starts active\..*Nothing was created/);
  assert.match(routineMessage(classifyRoutine(routine, [mine("ambitious-selfcheck", "x")]), "/p") ?? "", /^routine-custom: The routine ambitious-selfcheck runs a prompt that no template published.*left as it is/);

  const valid = { name: "ambitious-a", schedule: "", paused: false, prompt: "x", ...fingerprintOf("x"), variants: [], earlier: [] };
  assert.equal(parseTemplateRoutines([valid]).length, 1);
  const { sha256: _sha256, whitespaceSha256: _whitespaceSha256, ...unhashed } = valid;
  const { variants: _variants, ...withoutVariants } = valid;
  for (const bad of [{}, [{ ...valid, name: "not-a-template-routine" }], [{ ...valid, prompt: "", ...fingerprintOf("") }], [unhashed], [withoutVariants], [{ ...valid, variants: ["short"] }], [{ ...valid, earlier: [{ template: "0.1.0" }] }], [{ ...valid, earlier: [{ template: "0.1.0", whitespaceSha256: folded("y") }] }]]) {
    assert.throws(() => parseTemplateRoutines(bad), /embedded template routines/, JSON.stringify(bad));
  }
});

test("the routines file is read but never written, is refused under the private data directory, and no file means no check", (t) => {
  const home = scratch(t);
  const [now, before] = ["Run the sync command.", "Run the old command."];
  const template = [templateRoutine("ambitious-selfcheck", now, [["0.2.1", before]]), templateRoutine("ambitious-snapshot", "Collect a snapshot.", [], true)];
  const file = join(home, "current-routines.json");
  const written = JSON.stringify([{ name: "ambitious-selfcheck", schedule: "every day at 7:00 AM", prompt: `${before}\r\n`, paused: false }, { name: "weekly-digest", schedule: "every Monday", prompt: "Summarise the week." }]);
  writeFileSync(file, written);
  const report = checkRoutines(file, home, template);
  assert.equal(report.state, "checked");
  assert.deepEqual(report.routines.map(({ name, state, proposed }) => [name, state, proposed]), [
    ["ambitious-selfcheck", "out-of-date", join(home, "template", "routines", "ambitious-selfcheck.md")],
    ["ambitious-snapshot", "missing", join(home, "template", "routines", "ambitious-snapshot.md")],
  ], "one entry for each template routine; a routine the template does not have is not looked at");
  assert.deepEqual(report.messages.map((message) => message.split(":")[0]), ["routine-prompt-out-of-date", "routine-missing"]);
  assert.equal(readFileSync(file, "utf8"), written);
  assert.deepEqual(checkRoutines(null, home, template), { state: "not checked", routines: [], messages: [] });

  const refused = (contents: string | null, path: string, names: RegExp): void => {
    if (contents !== null) writeFileSync(path, contents);
    assert.throws(() => checkRoutines(path, home, template), (error: unknown) => error instanceof Failure && names.test(`${error.errors[0].code} ${error.errors[0].message}`), path);
  };
  refused(null, "/home/box/agent-data/routines.json", /^E_FORBIDDEN_PATH/);
  refused(null, join(home, "missing.json"), /^E_INPUT_SCHEMA .*could not be read/);
  refused("not json", file, /^E_INPUT_SCHEMA .*could not be read as JSON/);
  refused("{}", file, /^E_INPUT_SCHEMA .*must hold a list/);
  refused('[{"name":"ambitious-selfcheck","schedule":"x"}]', file, /^E_INPUT_SCHEMA routines\[0\]\.prompt must be text/);
  refused('[{"schedule":"x","prompt":"y"}]', file, /^E_INPUT_SCHEMA routines\[0\]\.name must be text/);
  refused("[7]", file, /^E_INPUT_SCHEMA routines\[0\] must be an object/);
});

test("the monitoring connection is found by its three tool names and confirmed by its identity; a name is never evidence, and a connector that fails is a different connector", () => {
  const tools = ["factory_plan", "send_feedback", "send_report", "server_info"];
  const find = (connector: { readonly name: string; readonly tools: unknown; readonly serverInfo: unknown }): readonly unknown[] => {
    const { kind, identity } = identifyConnection(parseConnectorOffers([connector])).connectors[0] ?? assert.fail("one connector was given");
    return [kind, identity];
  };
  assert.deepEqual(find({ name: "Anything", tools, serverInfo: null }), ["monitoring", "not confirmed"]);
  assert.deepEqual(find({ name: "Anything", tools, serverInfo: { identity: MONITORING_IDENTITY, service: "ambitious-monitoring" } }), ["monitoring", "confirmed"]);
  assert.deepEqual(find({ name: "Anything", tools: tools.map((tool) => `mcp__anything__${tool}`), serverInfo: null }), ["monitoring", "not confirmed"], "a platform prefix before a tool name is set aside");
  assert.deepEqual(find({ name: "Ambitious", tools: ["search", "resend_report", "send_feedback", "server_info"], serverInfo: null }), ["different", null], "a name is not evidence, and a tool that only ends like one of the three does not count");
  for (const absent of MONITORING_TOOLS) assert.deepEqual(find({ name: "Ambitious", tools: tools.filter((tool) => tool !== absent), serverInfo: null }), ["different", null], `without ${absent}`);
  assert.deepEqual(find({ name: "Ambitious", tools, serverInfo: { identity: "example.com/mcp/v1" } }), ["different", "mismatch"]);
  assert.deepEqual(find({ name: "Ambitious", tools, serverInfo: { identity: `${MONITORING_IDENTITY} ` } }), ["different", "mismatch"], "the identity must be exactly the service's");
  assert.deepEqual(find({ name: "Ambitious", tools, serverInfo: {} }), ["different", "mismatch"]);
  assert.deepEqual(find({ name: "Ambitious", tools: ["search"], serverInfo: { identity: MONITORING_IDENTITY } }), ["different", null], "an identity cannot make up for missing tools");
  assert.deepEqual(find({ name: "Ambitious", tools: null, serverInfo: null }), ["unidentified", null]);
  assert.equal(MONITORING_IDENTITY, "ambitiousbots.com/mcp/v1");
  assert.deepEqual([...MONITORING_TOOLS], ["server_info", "send_report", "send_feedback"]);

  const one = identifyConnection(parseConnectorOffers([{ name: "Reports", tools, serverInfo: null }, { name: "Ambitious", tools: ["search"], serverInfo: null }]));
  assert.deepEqual([one.monitoring, one.identity], ["Reports", "not confirmed"]);
  assert.deepEqual([one.toolsRead, one.toolsNotRead], [2, []]);
  assert.equal(one.tellOwner.length, 2);
  assert.equal(one.tellOwner[0], '"Reports" is the monitoring connection, found among the 2 connectors whose tools were read. No connector was left unread.');
  assert.match(one.tellOwner[1] ?? "", /"Reports" has the tools `server_info`, `send_report`, `send_feedback`.*Its identity was not confirmed, because `server_info` was not called\./);
  const two = identifyConnection(parseConnectorOffers([{ name: "A", tools, serverInfo: null }, { name: "B", tools, serverInfo: null }]));
  assert.deepEqual([two.monitoring, two.identity], [null, null]);
  assert.match(two.tellOwner[0] ?? "", /^More than one connector looks like the monitoring connection among the 2 connectors whose tools were read: "A", "B"\. None was chosen/);
  const none = identifyConnection(parseConnectorOffers([{ name: "Ambitious", tools: ["search"], serverInfo: null }]));
  assert.deepEqual([none.monitoring, none.tellOwner], [null, ["There is no monitoring connection among the 1 connector whose tools were read. No connector was left unread. The owner adds the monitoring connection through the platform's connection flow."]]);
  const hidden = identifyConnection(parseConnectorOffers([{ name: "Ambitious", tools: null, serverInfo: null }, { name: "Calendar", tools: ["list_events"], serverInfo: null }, { name: "Mail", tools: null, serverInfo: null }]));
  assert.deepEqual([hidden.monitoring, hidden.toolsRead, hidden.toolsNotRead], [null, 1, ["Ambitious", "Mail"]]);
  assert.equal(hidden.tellOwner[0], 'There is no monitoring connection among the 1 connector whose tools were read. The tools of 2 connectors were not read: "Ambitious", "Mail". Read their tool names from the platform\'s tool catalog and run this again.');
  assert.doesNotMatch(hidden.tellOwner.join(" "), /could not be identified/, "the answer says what was read and what was not, not that nothing could be said");
  assert.match(hidden.tellOwner.join(" "), /The tools of "Ambitious" were not read, so it cannot be told whether it is the monitoring connection\. Its name is not evidence\./);
  const partly = identifyConnection(parseConnectorOffers([{ name: "Reports", tools, serverInfo: null }, { name: "Mail", tools: null, serverInfo: null }]));
  assert.deepEqual([partly.monitoring, partly.toolsRead, partly.toolsNotRead], ["Reports", 1, ["Mail"]]);
  assert.equal(partly.tellOwner[0], '"Reports" is the monitoring connection, found among the 1 connector whose tools were read. The tools of 1 connector were not read: "Mail". Read their tool names from the platform\'s tool catalog and run this again.');
  const nothing = identifyConnection(parseConnectorOffers([]));
  assert.deepEqual([nothing.monitoring, nothing.toolsRead, nothing.toolsNotRead], [null, 0, []]);
  const impostor = identifyConnection(parseConnectorOffers([{ name: "Ambitious", tools, serverInfo: { identity: "other" } }]));
  assert.match(impostor.tellOwner.join(" "), /is a different connector: it has the tool names of the monitoring connection, but its `server_info` tool answered with the identity "other".*send it nothing/);

  const refused = (value: unknown, names: RegExp): void => {
    assert.throws(() => parseConnectorOffers(value), (error: unknown) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA" && names.test(error.errors[0].message), JSON.stringify(value));
  };
  refused({}, /must be a list/);
  refused([{ tools, serverInfo: null }], /connectors\[0\]\.name/);
  refused([{ name: "A", tools: "server_info", serverInfo: null }], /connectors\[0\]\.tools/);
  refused([{ name: "A", serverInfo: null }], /connectors\[0\]\.tools/);
  refused([{ name: "A", tools, serverInfo: "ambitiousbots.com/mcp/v1" }], /connectors\[0\]\.serverInfo/);
  refused([{ name: "A", tools }], /connectors\[0\]\.serverInfo/);
});
