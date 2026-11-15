import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Failure } from "../src/domain/failure.ts";
import { isNewerVersion, parseLock, type LockRow } from "../src/domain/lock.ts";
import type { Download } from "../src/install/install.ts";
import { decideSkillWrite, parseSkillOffers, templateVersionOf } from "../src/domain/skill-version.ts";
import { templateNote, templateStatus } from "../src/install/newer-template.ts";
import { latestInstallerVersion, releaseDownload, type Fetchers } from "../src/install/release.ts";
import { summaryOf, sync, type ModuleReport, type SyncRequest } from "../src/install/sync.ts";
import { fixturesDirectory, parseTemplateFiles, placeTemplateFiles } from "../src/install/template-files.ts";

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

test("the template's fixture files are written under template/fixtures in the home, once, and never under the private data directory", (t) => {
  const home = scratch(t);
  const files = parseTemplateFiles({ "probe/owner.expected.json": "[1]\n", "notes.txt": "plain\n" });
  const root = placeTemplateFiles(home, files);
  assert.equal(root, fixturesDirectory(home));
  assert.equal(readFileSync(join(home, "template", "fixtures", "probe", "owner.expected.json"), "utf8"), "[1]\n");
  writeFileSync(join(root, "notes.txt"), "altered");
  placeTemplateFiles(home, files);
  assert.equal(readFileSync(join(root, "notes.txt"), "utf8"), "plain\n");
  assert.throws(() => placeTemplateFiles("/home/box/agent-data/ambitious", files), Failure);
  for (const bad of [{ "../escape.json": "x" }, { "/absolute.json": "x" }, { "a/../../b.json": "x" }, { "ok.json": 7 }, []]) {
    assert.throws(() => parseTemplateFiles(bad), JSON.stringify(bad));
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

  const refused = (value: unknown, names: RegExp): void => {
    assert.throws(() => parseSkillOffers(value).map(decideSkillWrite), (error: unknown) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA" && names.test(error.errors[0].message), JSON.stringify(value));
  };
  refused({}, /must be a list/);
  refused([{ name: "someone-elses-skill", stored: null, candidate: body("0.2.2") }], /skills\[0\]\.name/);
  refused([{ name: "ambitious-example", candidate: body("0.2.2") }], /skills\[0\]\.stored/);
  refused([{ name: "ambitious-example", stored: null, candidate: 7 }], /skills\[0\]\.candidate/);
  refused([{ name: "ambitious-example", stored: null, candidate: "# No version line\n" }], /does not start with a "Template version: x\.y\.z" line/);
});
