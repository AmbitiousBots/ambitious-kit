import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildInstaller, readJson, sha256, templateRoot } from "./support.mjs";

const registry = readJson(join(templateRoot, "instructions.json"));
const currentText = readFileSync(join(templateRoot, "INSTRUCTIONS.md"), "utf8");
const previous = registry.versions.at(-2);
const baseText = readFileSync(join(templateRoot, previous.file), "utf8");

test("the built installer merges a proposal from embedded history, reports conflicts and unknown bases, verifies SHA-256 and changes no instructions file", (t) => {
  const installer = buildInstaller();
  const home = mkdtempSync(join(tmpdir(), "ambitious-merge-cli-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const current = join(home, "current.md");
  const published = join(home, "published.md");
  writeFileSync(published, currentText);
  const run = (ours, hash = sha256(currentText), extra = []) => {
    writeFileSync(current, ours);
    const processResult = spawnSync(process.execPath, [installer, "instructions-merge", "--current", current, "--published", published, "--published-sha256", hash, "--json", ...extra], { encoding: "utf8", env: { ...process.env, AMBITIOUS_HOME: home } });
    const envelope = JSON.parse(processResult.stdout);
    assert.equal(readFileSync(current, "utf8"), ours);
    assert.equal(readFileSync(published, "utf8"), currentText);
    assert.equal(envelope.command, "instructions-merge");
    return { status: processResult.status, ...envelope };
  };
  const local = "Use concise titles on Pages.";
  const clean = run(`${baseText}\n${local}\n`);
  assert.equal(clean.ok, true);
  assert.equal(clean.status, 0);
  assert.equal(clean.data.state, "merged");
  assert.equal(clean.data.base.version, previous.version);
  assert(clean.data.merged.includes(local));
  assert(clean.data.merged.startsWith(`Instructions version: ${registry.current}\n`));
  assert.equal(clean.data.localChangesKept.length, 1);
  assert.equal(clean.data.published.sha256, sha256(currentText));
  assert.equal(clean.data.published.version, registry.current);
  assert.match(clean.data.permissionsStatement, /permissions cannot be inferred/);

  const [baseLines, currentLines] = [baseText.split("\n"), currentText.split("\n")];
  const changedLine = baseLines.find((line) => line !== "" && !line.startsWith("Instructions version:") && !currentLines.includes(line));
  const addedAfter = currentLines[currentLines.findIndex((line) => line !== "" && !line.startsWith("Instructions version:") && !baseLines.includes(line)) - 1];
  assert(changedLine ?? addedAfter, "each published instructions change has a changed line, or a line added after one both texts have, to exercise an overlapping edit");
  const conflicted = run(changedLine === undefined ? baseText.replace(`${addedAfter}\n`, `${addedAfter}\nKeep the local wording for owner review.\n`) : baseText.replace(changedLine, "Keep the local wording for owner review."));
  assert.equal(conflicted.ok, true);
  assert.equal(conflicted.data.state, "conflicts");
  assert(conflicted.data.conflicts.some(({ current: ours }) => ours.includes("Keep the local wording for owner review.")));
  assert.match(conflicted.data.merged, /<<<<<<< current/);
  assert.match(conflicted.data.merged, />>>>>>> published/);

  const unknown = run("Local instructions with no known version.\n");
  assert.equal(unknown.data.state, "unknown base");
  assert.equal(unknown.data.conflicts[0].published, currentText);
  assert.equal(unknown.data.conflicts[0].current, "Local instructions with no known version.\n");
  const badHash = run(baseText, "0".repeat(64));
  assert.equal(badHash.status, 1);
  assert.equal(badHash.ok, false);
  assert.equal(badHash.errors[0].code, "E_INSTALL_CHECKSUM");
  const wrongOption = run(baseText, sha256(currentText), ["--lock", "unused"]);
  assert.equal(wrongOption.errors[0].code, "E_USAGE");

  const privateFile = spawnSync(process.execPath, [installer, "instructions-merge", "--current", "/home/box/agent-data/current.md", "--published", published, "--published-sha256", sha256(currentText)], { encoding: "utf8", env: { ...process.env, AMBITIOUS_HOME: home } });
  assert.equal(JSON.parse(privateFile.stdout).errors[0].code, "E_FORBIDDEN_PATH");
});
