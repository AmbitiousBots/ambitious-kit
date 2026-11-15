import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const kitRoot = join(import.meta.dirname, "..");
const kitPin = readFileSync(join(kitRoot, ".mise.toml"), "utf8");

const CONTENT = "stand-in for tla2tools.jar\n";
const CONTENT_URL = `data:application/octet-stream;base64,${Buffer.from(CONTENT).toString("base64")}`;
const CONTENT_HASH = createHash("sha256").update(CONTENT).digest("hex");
const OTHER_HASH = createHash("sha256").update("something else").digest("hex");

const repoPinning = (t, url, hash) => {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), "tla2tools-test-")));
  t.after(() => rmSync(repo, { recursive: true }));
  mkdirSync(join(repo, "scripts"));
  copyFileSync(join(import.meta.dirname, "tla2tools.mjs"), join(repo, "scripts", "tla2tools.mjs"));
  writeFileSync(
    join(repo, ".mise.toml"),
    kitPin
      .replace(/^TLA2TOOLS_URL = .*$/m, `TLA2TOOLS_URL = "${url}"`)
      .replace(/^TLA2TOOLS_SHA256 = .*$/m, `TLA2TOOLS_SHA256 = "${hash}"`),
  );
  const cache = join(repo, "cache");
  const run = () => {
    const result = spawnSync(process.execPath, [join(repo, "scripts", "tla2tools.mjs")], {
      encoding: "utf8",
      env: { ...process.env, MISE_TRUSTED_CONFIG_PATHS: repo, TLA2TOOLS_CACHE_DIR: cache },
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };
  return { cache, run };
};

const cached = (cache) => readdirSync(cache, { recursive: true });

test("the kit pins an exact https address and a full SHA-256", () => {
  assert.match(kitPin, /^TLA2TOOLS_URL = "https:\/\/\S+\/[0-9a-f]{40}\/\S+\.jar"$/m);
  assert.match(kitPin, /^TLA2TOOLS_SHA256 = "[0-9a-f]{64}"$/m);
  assert.match(kitPin, /^java = "temurin-21\.[0-9.+]+LTS"$/m);
});

test("a download that matches the pinned hash is saved and its path printed", (t) => {
  const { cache, run } = repoPinning(t, CONTENT_URL, CONTENT_HASH);
  const first = run();
  assert.equal(first.status, 0, first.stderr);
  const path = first.stdout.trim();
  assert.equal(path, join(cache, `tla2tools-${CONTENT_HASH}.jar`));
  assert.equal(readFileSync(path, "utf8"), CONTENT);
  assert.deepEqual(run(), first);
});

test("a download that does not match the pinned hash is refused and nothing is saved", (t) => {
  const { cache, run } = repoPinning(t, CONTENT_URL, OTHER_HASH);
  const result = run();
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.ok(
    result.stderr.includes(`its SHA-256 is ${CONTENT_HASH}, but .mise.toml pins ${OTHER_HASH}. Nothing was saved.`),
    result.stderr,
  );
  assert.throws(() => cached(cache), { code: "ENOENT" });
});

test("a saved file that was changed afterwards is refused", (t) => {
  const { run } = repoPinning(t, CONTENT_URL, CONTENT_HASH);
  const path = run().stdout.trim();
  writeFileSync(path, "tampered\n");
  const result = run();
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Refusing the cached file .* The file changed after it was downloaded\. Delete it and run again\./);
});

test("a pin that is not a full SHA-256 is refused before anything is downloaded", (t) => {
  const { cache, run } = repoPinning(t, CONTENT_URL, CONTENT_HASH.slice(0, 12));
  const result = run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Set TLA2TOOLS_SHA256 in the \[env\] table of \.mise\.toml/);
  assert.throws(() => cached(cache), { code: "ENOENT" });
});
