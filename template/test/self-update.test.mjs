import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Failure } from "../../packages/kit/src/domain/failure.ts";
import { selfUpdate } from "../../packages/kit/src/install/self-update.ts";
import { sha256Of } from "../../packages/kit/src/install/text-file.ts";
import { buildInstaller, readJson, repoRoot } from "./support.mjs";

const OLD = "#!/usr/bin/env node\nthrow new Error('the old installer must not be executed');\n";
const NEW = "#!/usr/bin/env node\nthrow new Error('verification must not execute the download');\n";
const asset = (version) => `ambitious-modules-${version}.mjs`;
const address = (version) => `https://github.com/AmbitiousBots/ambitious-kit/releases/download/kit-v${version}`;

const scratch = (t) => {
  const home = mkdtempSync(join(tmpdir(), "ambitious-self-update-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
};

const installed = (t, version = "0.2.7") => {
  const home = scratch(t);
  const bin = join(home, "bin");
  mkdirSync(bin);
  writeFileSync(join(bin, asset(version)), OLD);
  writeFileSync(join(bin, "SHA256SUMS"), `${sha256Of(OLD)}  ${asset(version)}\n`);
  symlinkSync(asset(version), join(bin, "ambitious-modules"));
  return home;
};

const snapshot = (home) => Object.fromEntries(readdirSync(join(home, "bin")).sort().map((name) => {
  const path = join(home, "bin", name);
  return [name, lstatSync(path).isSymbolicLink() ? `-> ${readlinkSync(path)}` : readFileSync(path, "utf8")];
}));

const release = (version = "0.3.0", overrides = {}) => {
  const calls = [];
  const files = { SHA256SUMS: `${sha256Of(NEW)}  ${asset(version)}\n`, [asset(version)]: NEW, ...overrides };
  const fetchers = {
    web: async (url) => {
      calls.push(url);
      assert(url.startsWith(`${address(version)}/`), `unexpected release URL ${url}`);
      const name = url.slice(address(version).length + 1);
      if (files[name] === undefined) throw new Error("the fake release answered 404");
      return new TextEncoder().encode(files[name]);
    },
    gh: async (args) => {
      calls.push(args);
      throw new Error("the fake GitHub CLI is unavailable");
    },
    webLatestTag: async () => assert.fail("self-update must never resolve latest"),
  };
  return { calls, fetchers };
};

const request = (home, extra = {}) => ({ home, runningVersion: "0.2.7", version: "0.3.0", sha256: sha256Of(NEW), ...extra });
const hasCode = (code) => (error) => error instanceof Failure && error.errors[0].code === code;

test("self-update verifies the fixed public release against both checksums, preserves the old file and only then switches the link", async (t) => {
  const home = installed(t);
  const fake = release();
  const fetchers = { ...fake.fetchers, web: async (url) => {
    assert.equal(readlinkSync(join(home, "bin", "ambitious-modules")), asset("0.2.7"));
    return fake.fetchers.web(url);
  } };
  const result = await selfUpdate(request(home), fetchers);
  assert.deepEqual(fake.calls, [`${address("0.3.0")}/SHA256SUMS`, `${address("0.3.0")}/${asset("0.3.0")}`]);
  assert.equal(result.action, "installed");
  assert.equal(result.previousVersion, "0.2.7");
  assert.equal(result.version, "0.3.0");
  assert.equal(result.sha256, sha256Of(NEW));
  assert.equal(readFileSync(join(home, "bin", asset("0.2.7")), "utf8"), OLD);
  assert.equal(readFileSync(result.path, "utf8"), NEW);
  assert.equal(readlinkSync(result.link), asset("0.3.0"));
  assert.equal(statSync(result.path).mode & 0o777, 0o755);
  assert(!readdirSync(join(home, "bin")).some((name) => name.endsWith(".partial") || name.endsWith(".lock")));
  const before = snapshot(home);
  const changed = statSync(result.path).mtimeMs;
  assert.equal((await selfUpdate(request(home), release().fetchers)).action, "unchanged");
  assert.deepEqual(snapshot(home), before);
  assert.equal(statSync(result.path).mtimeMs, changed);
});

test("a service checksum alone, release checksum alone, duplicate checksum or failed download cannot replace the old installer", async (t) => {
  const home = installed(t);
  const before = snapshot(home);
  for (const [overrides, checksum, code] of [
    [{}, "0".repeat(64), "E_INSTALL_CHECKSUM"],
    [{ [asset("0.3.0")]: "swapped" }, sha256Of(NEW), "E_INSTALL_CHECKSUM"],
    [{ SHA256SUMS: `${sha256Of("swapped")}  ${asset("0.3.0")}\n`, [asset("0.3.0")]: "swapped" }, sha256Of(NEW), "E_INSTALL_CHECKSUM"],
    [{ SHA256SUMS: "" }, sha256Of(NEW), "E_INSTALL_CHECKSUM"],
    [{ SHA256SUMS: `${sha256Of(NEW)}  ${asset("0.3.0")}\n`.repeat(2) }, sha256Of(NEW), "E_INSTALL_CHECKSUM"],
    [{ [asset("0.3.0")]: undefined }, sha256Of(NEW), "E_INSTALL_DOWNLOAD"],
    [{ SHA256SUMS: undefined }, sha256Of(NEW), "E_INSTALL_DOWNLOAD"],
  ]) {
    await assert.rejects(selfUpdate(request(home, { sha256: checksum }), release("0.3.0", overrides).fetchers), hasCode(code));
    assert.deepEqual(snapshot(home), before);
  }
});

test("self-update never downgrades the running or installed version, including arbitrarily large numeric versions", async (t) => {
  for (const [runningVersion, active, version] of [
    ["0.3.1", "0.2.7", "0.3.0"],
    ["0.2.7", "0.4.0", "0.3.0"],
    ["0.2.7", "9007199254740993.0.0", "9007199254740992.0.0"],
  ]) {
    const home = installed(t, active);
    const before = snapshot(home);
    const fake = release(version);
    await assert.rejects(selfUpdate(request(home, { runningVersion, version }), fake.fetchers), hasCode("E_INSTALL_DOWNGRADE"));
    assert.deepEqual(fake.calls, []);
    assert.deepEqual(snapshot(home), before);
  }
});

test("a newer link placed while a release downloads is rechecked before switching", async (t) => {
  const home = installed(t);
  const fake = release();
  const link = join(home, "bin", "ambitious-modules");
  const fetchers = { ...fake.fetchers, web: async (url) => {
    const result = await fake.fetchers.web(url);
    if (url.endsWith(".mjs")) {
      writeFileSync(join(home, "bin", asset("0.4.0")), OLD);
      rmSync(link);
      symlinkSync(asset("0.4.0"), link);
    }
    return result;
  } };
  await assert.rejects(selfUpdate(request(home), fetchers), hasCode("E_INSTALL_DOWNGRADE"));
  assert.equal(readlinkSync(link), asset("0.4.0"));
  assert.equal(lstatSync(join(home, "bin", asset("0.3.0")), { throwIfNoEntry: false }), undefined);
});

test("concurrent self-updates cannot race to switch the link", async (t) => {
  const home = installed(t);
  const fake = release();
  let releaseDownload;
  const waiting = new Promise((resolve) => { releaseDownload = resolve; });
  let started;
  const downloading = new Promise((resolve) => { started = resolve; });
  const fetchers = { ...fake.fetchers, web: async (url) => {
    started();
    await waiting;
    return fake.fetchers.web(url);
  } };
  const first = selfUpdate(request(home), fetchers);
  await downloading;
  await assert.rejects(selfUpdate(request(home), release().fetchers), hasCode("E_INSTALL_BUSY"));
  releaseDownload();
  await first;
  assert.equal(readlinkSync(join(home, "bin", "ambitious-modules")), asset("0.3.0"));
});

test("self-update refuses unsupported versions, malformed hashes, private paths and links whose installed version cannot be established", async (t) => {
  const fake = release();
  for (const version of ["latest", "../0.3.0", "0.03.0", "0.3.0-rc.1", "0.3.0+build", "https://example.org/0.3.0"]) {
    await assert.rejects(selfUpdate(request(scratch(t), { version }), fake.fetchers), hasCode("E_USAGE"));
  }
  for (const sha256 of ["", "a".repeat(63), "A".repeat(64), `${sha256Of(NEW)}\n`]) {
    await assert.rejects(selfUpdate(request(scratch(t), { sha256 }), fake.fetchers), hasCode("E_USAGE"));
  }
  await assert.rejects(selfUpdate(request("/home/box/agent-data/updates"), fake.fetchers), hasCode("E_FORBIDDEN_PATH"));
  const home = scratch(t);
  symlinkSync("/home/box/agent-data", join(home, "bin"));
  await assert.rejects(selfUpdate(request(home), fake.fetchers), hasCode("E_FORBIDDEN_PATH"));
  const unrecognized = installed(t);
  const link = join(unrecognized, "bin", "ambitious-modules");
  rmSync(link);
  writeFileSync(link, OLD);
  await assert.rejects(selfUpdate(request(unrecognized), fake.fetchers), hasCode("E_INSTALL_VERSION"));
  assert.equal(readFileSync(link, "utf8"), OLD);
  assert.deepEqual(fake.calls, []);
});

test("an existing file at the target version with different bytes is retained, never overwritten", async (t) => {
  const home = installed(t);
  writeFileSync(join(home, "bin", asset("0.3.0")), "different installer");
  const before = snapshot(home);
  await assert.rejects(selfUpdate(request(home), release().fetchers), hasCode("E_INSTALL_CHECKSUM"));
  assert.deepEqual(snapshot(home), before);
});

test("the self-update CLI requires its two flags and rejects supplied addresses, mirrors and unrelated inputs before network access", (t) => {
  const installer = buildInstaller();
  const home = installed(t, "999999999999999999.0.0");
  const before = snapshot(home);
  const guard = join(home, "no-network.mjs");
  const attempted = join(home, "network-attempted");
  writeFileSync(guard, `import { writeFileSync } from "node:fs";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
const refuse = () => { writeFileSync(${JSON.stringify(attempted)}, "attempted"); throw new Error("network forbidden in this test"); };
globalThis.fetch = refuse;
childProcess.execFile = refuse;
syncBuiltinESMExports();
`);
  const version = readJson(join(repoRoot, "package.json")).version;
  const required = ["--version", version, "--sha256", sha256Of(NEW)];
  const run = (args, input = "") => {
    const result = spawnSync(process.execPath, ["--import", guard, installer, "self-update", "--json", ...args], {
      encoding: "utf8", input, timeout: 10_000,
      env: { ...process.env, AMBITIOUS_HOME: home, AMBITIOUS_MODULE_MIRROR: join(home, "untrusted-mirror") },
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stderr, "");
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.ok, false);
    assert.equal(envelope.module, "modules");
    assert.equal(envelope.command, "self-update");
    assert.equal(envelope.meta.version, version);
    assert.equal(lstatSync(attempted, { throwIfNoEntry: false }), undefined, "no web request or GitHub subprocess may run");
    assert.deepEqual(snapshot(home), before);
    return envelope.errors[0];
  };
  assert.match(run([]).message, /needs --version/);
  assert.match(run(["--version", version]).message, /needs --sha256/);
  assert.match(run(["--sha256", sha256Of(NEW)]).message, /needs --version/);
  assert.match(run([], JSON.stringify({ version, sha256: sha256Of(NEW), url: "https://example.org/installer.mjs" })).message, /needs --version/, "stdin cannot supply upgrade arguments");
  for (const option of ["from", "lock", "url", "in", "current", "published", "published-sha256", "instructions", "routines"]) {
    assert.equal(run([...required, `--${option}`, "https://example.org/installer.mjs"]).code, "E_USAGE", option);
  }
  assert.equal(run([...required, "https://example.org/installer.mjs"]).code, "E_USAGE");
  assert.equal(run(["--version", "https://example.org/installer.mjs", "--sha256", sha256Of(NEW)]).code, "E_USAGE");
  assert.equal(run(required).code, "E_INSTALL_DOWNGRADE", "the active link prevents a stale installer from downgrading it");
  assert.equal(run(["--version", "0.0.0", "--sha256", sha256Of(NEW)]).code, "E_INSTALL_DOWNGRADE");
});
