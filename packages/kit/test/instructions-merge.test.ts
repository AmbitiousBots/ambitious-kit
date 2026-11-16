import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Failure } from "../src/domain/failure.ts";
import type { InstructionsCatalogue } from "../src/domain/instructions.ts";
import { mergeLines } from "../src/domain/merge-lines.ts";
import { mergeInstructions } from "../src/install/instructions-merge.ts";
import { fingerprintOf, sha256Of } from "../src/install/text-file.ts";

const base = "Instructions version: 1\n\nKeep private data local.\nUse Pages.\nAnswer plainly.\n";
const published = "Instructions version: 2\n\nKeep private data local.\nUse Pages.\nAnswer briefly.\n";
const catalogue: InstructionsCatalogue = {
  version: 2,
  oldestSupported: 1,
  text: published,
  known: [{ version: 1, ...fingerprintOf(base) }, { version: 2, ...fingerprintOf(published) }],
  grants: { pages: "Write Pages.", updates: "Check updates." },
  versions: [
    { version: 1, text: base, grants: ["pages"], reasons: {} },
    { version: 2, text: published, grants: ["pages", "updates"], reasons: { updates: "Learn about published updates." } },
  ],
};

const files = (t: TestContext, current: string, target = published): { currentFile: string; publishedFile: string; run: () => ReturnType<typeof mergeInstructions> } => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-merge-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const [currentFile, publishedFile] = [join(directory, "current.md"), join(directory, "published.md")];
  writeFileSync(currentFile, current);
  writeFileSync(publishedFile, target);
  return { currentFile, publishedFile, run: () => mergeInstructions(currentFile, publishedFile, sha256Of(target), catalogue) };
};

test("instructions merge keeps independent local edits and compares known published permissions without claiming to understand custom permissions", (t) => {
  const current = base.replace("Use Pages.", "Use Pages with concise titles.");
  const fixture = files(t, current);
  const result = fixture.run();
  assert.equal(result.state, "merged");
  assert.deepEqual(result.base, { version: 1, match: "version line" });
  assert.equal(result.merged, published.replace("Use Pages.", "Use Pages with concise titles."));
  assert.deepEqual(result.localChangesKept.map(({ before, after }) => [before, after]), [["Use Pages.", "Use Pages with concise titles."]]);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.permissions?.comparison, "more");
  assert.match(result.permissionsStatement, /permissions cannot be inferred/);
  assert.match(result.permissionsStatement, /Check updates\./);
  assert.equal(readFileSync(fixture.currentFile, "utf8"), current);
  assert.equal(readFileSync(fixture.publishedFile, "utf8"), published);
});

test("an exact published source and a whitespace copy identify their base without a version line", (t) => {
  const noVersion = base.replace("Instructions version: 1\n\n", "");
  const [first, second, fingerprint] = [catalogue.versions[0], catalogue.versions[1], catalogue.known[1]];
  assert(first !== undefined && second !== undefined && fingerprint !== undefined);
  const old: InstructionsCatalogue = { ...catalogue, known: [{ version: 1, ...fingerprintOf(noVersion) }, fingerprint], versions: [{ ...first, text: noVersion }, second] };
  for (const [current, match] of [[noVersion, "exact"], [noVersion.replaceAll("\n", "\r\n"), "whitespace"], [noVersion.replaceAll(" ", "\t").replaceAll("\n", "  \n\n"), "whitespace"]] as const) {
    const fixture = files(t, current);
    const result = mergeInstructions(fixture.currentFile, fixture.publishedFile, sha256Of(published), old);
    assert.deepEqual(result.base, { version: 1, match });
    assert.equal(result.merged, published);
    assert.equal(result.permissions?.comparedWith, "the bot's present text");
    assert.doesNotMatch(result.permissionsStatement, /cannot be inferred/);
  }
});

test("overlapping local and published edits show both versions and the base in a conflict", (t) => {
  const result = files(t, base.replace("Answer plainly.", "Answer in detail.")).run();
  assert.equal(result.state, "conflicts");
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(result.conflicts[0], { startLine: 5, endLine: 5, base: "Answer plainly.", current: "Answer in detail.", published: "Answer briefly." });
  assert.match(result.merged, /<<<<<<< current\nAnswer in detail\.\n\|\|\|\|\|\|\| base\nAnswer plainly\.\n=======\nAnswer briefly\.\n>>>>>>> published/);
  assert.deepEqual(result.localChangesKept, []);
});

test("unknown bases keep both complete texts and never pretend a clean merge", (t) => {
  const current = "Use local instructions with no known base.\n";
  const result = files(t, current).run();
  assert.equal(result.state, "unknown base");
  assert.equal(result.base, null);
  assert.equal(result.conflicts[0]?.current, current);
  assert.equal(result.conflicts[0]?.published, published);
  assert(result.merged.includes(current));
  assert(result.merged.includes(published));
});

test("the published checksum and both paths are checked before a merge", (t) => {
  const fixture = files(t, base);
  const failsWith = (code: string) => (error: unknown): boolean => error instanceof Failure && error.errors[0]?.code === code;
  assert.throws(() => mergeInstructions(fixture.currentFile, fixture.publishedFile, "0".repeat(64), catalogue), failsWith("E_INSTALL_CHECKSUM"));
  assert.throws(() => mergeInstructions(fixture.currentFile, fixture.publishedFile, "no hash", catalogue), failsWith("E_USAGE"));
  assert.throws(() => mergeInstructions("/home/box/agent-data/current.md", fixture.publishedFile, sha256Of(published), catalogue), failsWith("E_FORBIDDEN_PATH"));
  assert.throws(() => mergeInstructions(fixture.currentFile, "/home/box/agent-data/published.md", sha256Of(published), catalogue), failsWith("E_FORBIDDEN_PATH"));
});

test("line merge keeps insertions, deletions, identical edits and independent adjacent replacements", () => {
  assert.equal(mergeLines("a\nb\nc\n", "a\nlocal\nb\nc\n", "a\nb\npublished\nc\n").merged, "a\nlocal\nb\npublished\nc\n");
  assert.equal(mergeLines("a\nb\nc\n", "a\nc\n", "a\nb\nC\n").merged, "a\nC\n");
  assert.equal(mergeLines("a\nb\nc\n", "a\nB\nc\n", "a\nB\nc\n").merged, "a\nB\nc\n");
  assert.equal(mergeLines("a\nb\nc\n", "A\nb\nc\n", "a\nB\nc\n").merged, "A\nB\nc\n");
  assert.equal(mergeLines("a\nb\n", "a\nlocal\nb\n", "a\npublished\nb\n").conflicts.length, 1);
  assert.equal(mergeLines("a\nb\nc\n", "a\n", "a\nb\nC\n").conflicts.length, 1);
});

test("unchanged sides and identical changes preserve all lines across varied inputs", () => {
  for (let size = 0; size < 60; size += 1) {
    const original = Array.from({ length: size }, (_, index) => `line ${index % 7}`).join("\n");
    const changed = `prefix\n${original}\nnew suffix`;
    assert.equal(mergeLines(original, original, changed).merged, changed);
    assert.equal(mergeLines(original, changed, original).merged, changed);
    assert.equal(mergeLines(original, changed, changed).merged, changed);
  }
});

test("large changes use a bounded comparison and keep both complete versions on conflict", () => {
  const original = Array.from({ length: 1_500 }, (_, index) => `base ${index}`).join("\n");
  const current = original.replaceAll("base", "local");
  const target = original.replaceAll("base", "published");
  const result = mergeLines(original, current, target);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0]?.current, current);
  assert.equal(result.conflicts[0]?.published, target);
  assert.equal(mergeLines(original, current, original).merged, current);
});
