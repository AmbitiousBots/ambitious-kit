import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Failure } from "../src/domain/failure.ts";
import type { Download } from "../src/install/install.ts";
import { installRuntime, RUNTIME_LOCK, RUNTIME_MARKER, runtimeLockProblems, type RunTool, type RuntimeRequest } from "../src/install/runtime.ts";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const HASH = "a".repeat(64);
const LOCK = `solver==1.2.3 \\\n    --hash=sha256:${HASH} \\\n    --hash=sha256:${"b".repeat(64)}\nhelper==0.4.0 --hash=sha256:${"c".repeat(64)}\n`;
const ASSET = "ambitious-constraints-0.1.0.runtime.txt";
const RELEASE = { [ASSET]: LOCK, SHA256SUMS: `${sha256(LOCK)}  ${ASSET}\n` };

const home = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-kit-runtime-"));
  t.after(() => rmSync(directory, { recursive: true }));
  return directory;
};

const release = (files: Readonly<Record<string, string>>): { readonly download: Download; readonly requested: string[] } => {
  const requested: string[] = [];
  return {
    requested,
    download: (fileName) => {
      requested.push(fileName);
      const content = files[fileName];
      return content === undefined ? Promise.reject(new Error("the server answered 404")) : Promise.resolve(new TextEncoder().encode(content));
    },
  };
};

const tools = (failAt: "venv" | "pip" | null = null): { readonly runTool: RunTool; readonly calls: string[][] } => {
  const calls: string[][] = [];
  return {
    calls,
    runTool: (program, args) => {
      calls.push([program, ...args]);
      const step = args[1] === "venv" ? "venv" : "pip";
      if (step === "venv") {
        const target = args[2] ?? "";
        mkdirSync(join(target, "bin"), { recursive: true });
        writeFileSync(join(target, "bin", "python"), "");
      }
      return step === failAt ? Promise.reject(new Error(`${step} said no`)) : Promise.resolve();
    },
  };
};

const request = (directory: string, download: Download, runTool: RunTool): RuntimeRequest => ({ module: "constraints", version: "0.1.0", home: directory, download, runTool });

const failureCode = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
    return "no failure";
  } catch (error) {
    return error instanceof Failure ? error.errors[0].code : `unexpected ${String(error)}`;
  }
};

const runtimeEntries = (directory: string): readonly string[] =>
  existsSync(join(directory, "constraints", "runtime")) ? readdirSync(join(directory, "constraints", "runtime")).sort() : [];

test("a first run builds the runtime in a staging directory, marks it and moves it into place under the lock's checksum", async (t) => {
  const directory = home(t);
  const { download } = release(RELEASE);
  const { runTool, calls } = tools();
  const outcome = await installRuntime(request(directory, download, runTool));
  const final = join(directory, "constraints", "runtime", sha256(LOCK));
  assert.deepEqual(outcome, { action: "installed", lock: ASSET, lockSha256: sha256(LOCK), path: final });
  assert.deepEqual(runtimeEntries(directory), [sha256(LOCK)]);
  assert.equal(readFileSync(join(final, RUNTIME_LOCK), "utf8"), LOCK);
  assert.deepEqual(JSON.parse(readFileSync(join(final, RUNTIME_MARKER), "utf8")), { module: "constraints", version: "0.1.0", lockSha256: sha256(LOCK) });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0]?.slice(0, 3), ["python3", "-m", "venv"]);
  assert.ok(calls[0]?.[3]?.endsWith(".partial"));
  assert.deepEqual(calls[1]?.slice(1, 10), ["-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--no-deps", "--require-hashes", "--only-binary", ":all:"]);
  assert.match(readFileSync(join(directory, "bin", "SHA256SUMS"), "utf8"), new RegExp(`^${sha256(LOCK)}  ${ASSET}$`, "m"));
});

test("a second run downloads nothing, runs nothing and changes nothing", async (t) => {
  const directory = home(t);
  await installRuntime(request(directory, release(RELEASE).download, tools().runTool));
  const again = release(RELEASE);
  const { runTool, calls } = tools();
  const outcome = await installRuntime(request(directory, again.download, runTool));
  assert.equal(outcome.action, "unchanged");
  assert.deepEqual(again.requested, []);
  assert.deepEqual(calls, []);
});

test("a runtime whose marker was removed is built again", async (t) => {
  const directory = home(t);
  const first = await installRuntime(request(directory, release(RELEASE).download, tools().runTool));
  rmSync(join(first.path, RUNTIME_MARKER));
  const outcome = await installRuntime(request(directory, release(RELEASE).download, tools().runTool));
  assert.equal(outcome.action, "installed");
  assert.ok(existsSync(join(first.path, RUNTIME_MARKER)));
});

for (const step of ["venv", "pip"] as const) {
  test(`a failed ${step} step leaves no runtime and no staging directory behind`, async (t) => {
    const directory = home(t);
    assert.equal(await failureCode(installRuntime(request(directory, release(RELEASE).download, tools(step).runTool))), "E_INSTALL_RUNTIME");
    assert.deepEqual(runtimeEntries(directory), []);
    assert.equal(existsSync(join(directory, "bin", "SHA256SUMS")), false);
  });
}

test("a lock that does not match the release checksum is refused before anything runs", async (t) => {
  const directory = home(t);
  const { runTool, calls } = tools();
  const damaged = release({ ...RELEASE, [ASSET]: `${LOCK}extra==1.0.0 --hash=sha256:${HASH}\n` });
  assert.equal(await failureCode(installRuntime(request(directory, damaged.download, runTool))), "E_INSTALL_CHECKSUM");
  assert.deepEqual(calls, []);
  assert.deepEqual(runtimeEntries(directory), []);
});

test("a release with no runtime lock is refused", async (t) => {
  const directory = home(t);
  assert.equal(await failureCode(installRuntime(request(directory, release({ SHA256SUMS: "" }).download, tools().runTool))), "E_INSTALL_CHECKSUM");
  assert.equal(await failureCode(installRuntime(request(directory, release({}).download, tools().runTool))), "E_INSTALL_DOWNLOAD");
});

test("a lock with a package that has no exact version or no hash is refused", async (t) => {
  const directory = home(t);
  const loose = "solver>=1.2\n";
  const { runTool, calls } = tools();
  const unpinned = release({ [ASSET]: loose, SHA256SUMS: `${sha256(loose)}  ${ASSET}\n` });
  assert.equal(await failureCode(installRuntime(request(directory, unpinned.download, runTool))), "E_INSTALL_RUNTIME");
  assert.deepEqual(calls, []);
  assert.deepEqual(runtimeLockProblems(LOCK), []);
  assert.equal(runtimeLockProblems("solver==1.2.3\n").length, 1);
  assert.equal(runtimeLockProblems("--index-url https://example.com/simple\n").length, 1);
  assert.equal(runtimeLockProblems("\n").length, 1);
});

test("the bot's private data directory is refused as a home", async () => {
  assert.equal(await failureCode(installRuntime(request("/home/box/agent-data/home", release(RELEASE).download, tools().runTool))), "E_FORBIDDEN_PATH");
});
