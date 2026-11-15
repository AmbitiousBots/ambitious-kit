import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Failure } from "../src/domain/failure.ts";
import { install, type Download, type InstallRequest } from "../src/install/install.ts";
import { releaseSource } from "../src/install/source.ts";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const V1 = "#!/usr/bin/env node\nconsole.log('one');\n";
const V2 = "#!/usr/bin/env node\nconsole.log('two');\n";
const ASSET_1 = "ambitious-tasks-0.3.1.mjs";
const ASSET_2 = "ambitious-tasks-0.4.0.mjs";

type Release = { readonly download: Download; readonly requested: string[] };

const release = (files: Readonly<Record<string, string>>): Release => {
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

const GOOD = { [ASSET_1]: V1, [ASSET_2]: V2, SHA256SUMS: `${sha256(V1)}  ${ASSET_1}\n${sha256(V2)}  ${ASSET_2}\n` };

const home = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-kit-install-"));
  t.after(() => rmSync(directory, { recursive: true }));
  return directory;
};

const request = (directory: string, download: Download, version = "0.3.1"): InstallRequest => ({
  module: "tasks",
  version,
  kind: "mjs",
  home: directory,
  download,
});

const snapshot = (bin: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    readdirSync(bin)
      .sort()
      .map((name) => [name, name === "ambitious-tasks" ? `-> ${readlinkSync(join(bin, name))}` : readFileSync(join(bin, name), "utf8")]),
  );

const failureCode = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
    return "no failure";
  } catch (error) {
    return error instanceof Failure ? error.errors[0].code : `not a Failure: ${String(error)}`;
  }
};

test("with nothing installed, the asset is verified, made executable, linked and recorded", async (t) => {
  const directory = home(t);
  const outcome = await install(request(directory, release(GOOD).download));
  const bin = join(directory, "bin");
  assert.deepEqual(outcome, { action: "installed", asset: ASSET_1, path: join(bin, ASSET_1), link: join(bin, "ambitious-tasks"), sha256: sha256(V1) });
  assert.deepEqual(snapshot(bin), { SHA256SUMS: `${sha256(V1)}  ${ASSET_1}\n`, "ambitious-tasks": `-> ${ASSET_1}`, [ASSET_1]: V1 });
  assert.equal(statSync(join(bin, ASSET_1)).mode & 0o777, 0o755);
});

test("installing the same version again downloads nothing and writes nothing", async (t) => {
  const directory = home(t);
  await install(request(directory, release(GOOD).download));
  const bin = join(directory, "bin");
  const before = { files: snapshot(bin), changed: statSync(join(bin, ASSET_1)).mtimeMs, directoryChanged: statSync(bin).mtimeMs };
  const again = release(GOOD);
  const outcome = await install(request(directory, again.download));
  assert.equal(outcome.action, "unchanged");
  assert.deepEqual(again.requested, []);
  assert.deepEqual({ files: snapshot(bin), changed: statSync(join(bin, ASSET_1)).mtimeMs, directoryChanged: statSync(bin).mtimeMs }, before);
});

test("an installed file whose checksum no longer matches is downloaded again and replaced", async (t) => {
  const directory = home(t);
  await install(request(directory, release(GOOD).download));
  writeFileSync(join(directory, "bin", ASSET_1), "damaged");
  const outcome = await install(request(directory, release(GOOD).download));
  assert.equal(outcome.action, "replaced");
  assert.equal(readFileSync(join(directory, "bin", ASSET_1), "utf8"), V1);
});

test("another version is installed beside the first and the link switches; switching back needs no download", async (t) => {
  const directory = home(t);
  const bin = join(directory, "bin");
  await install(request(directory, release(GOOD).download));
  assert.equal((await install(request(directory, release(GOOD).download, "0.4.0"))).action, "installed");
  assert.deepEqual(snapshot(bin), {
    SHA256SUMS: `${sha256(V1)}  ${ASSET_1}\n${sha256(V2)}  ${ASSET_2}\n`,
    "ambitious-tasks": `-> ${ASSET_2}`,
    [ASSET_1]: V1,
    [ASSET_2]: V2,
  });
  const back = release(GOOD);
  assert.equal((await install(request(directory, back.download))).action, "relinked");
  assert.deepEqual(back.requested, []);
  assert.equal(readlinkSync(join(bin, "ambitious-tasks")), ASSET_1);
});

test("a failed download or a wrong checksum leaves the existing install and link exactly as they were", async (t) => {
  const directory = home(t);
  const bin = join(directory, "bin");
  await install(request(directory, release(GOOD).download));
  const before = snapshot(bin);
  const broken: readonly (readonly [Readonly<Record<string, string>>, string])[] = [
    [{}, "E_INSTALL_DOWNLOAD"],
    [{ SHA256SUMS: GOOD.SHA256SUMS }, "E_INSTALL_DOWNLOAD"],
    [{ ...GOOD, [ASSET_2]: "tampered" }, "E_INSTALL_CHECKSUM"],
    [{ ...GOOD, SHA256SUMS: `${sha256(V1)}  ${ASSET_1}\n` }, "E_INSTALL_CHECKSUM"],
    [{ ...GOOD, SHA256SUMS: "not a checksum file" }, "E_INSTALL_CHECKSUM"],
  ];
  for (const [files, code] of broken) {
    assert.equal(await failureCode(install(request(directory, release(files).download, "0.4.0"))), code);
    assert.deepEqual(snapshot(bin), before);
  }
  const empty = home(t);
  assert.equal(await failureCode(install(request(empty, release({ ...GOOD, [ASSET_1]: "tampered" }).download))), "E_INSTALL_CHECKSUM");
  assert.equal(existsSync(join(empty, "bin")), false);
});

test("only an exact version of a named module is installed, never under the bot's private data directory", async (t) => {
  const directory = home(t);
  const { download } = release(GOOD);
  assert.equal(await failureCode(install(request(directory, download, "latest"))), "E_USAGE");
  assert.equal(await failureCode(install(request(directory, download, "0.3"))), "E_USAGE");
  assert.equal(await failureCode(install({ ...request(directory, download), module: "../tasks" })), "E_USAGE");
  assert.equal(await failureCode(install(request("/home/box/agent-data/home", download))), "E_FORBIDDEN_PATH");
  assert.equal(existsSync(join(directory, "bin")), false);
});

test("a release can be installed from a directory that holds the downloaded assets", async (t) => {
  const directory = home(t);
  const source = home(t);
  for (const [name, content] of Object.entries(GOOD)) writeFileSync(join(source, name), content);
  const outcome = await install(request(directory, releaseSource(source)));
  assert.equal(outcome.action, "installed");
  assert.equal(readFileSync(outcome.path, "utf8"), V1);
});
