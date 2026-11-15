import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { lintMessages } from "./lint.ts";

const whyComments = (count: number): string =>
  Array.from({ length: count }, (_, index) => `// WHY: reason number ${index}.\nexport const value${index} = ${index};\n`).join("");

const repoWith = (t: TestContext, files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "ambitious-lint-budget-"));
  t.after(() => rmSync(root, { recursive: true }));
  for (const [file, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), code);
  }
  return root;
};

const note = "// note\nexport const a = 1;\n";
const banned = (left: number): string =>
  `Delete the comment. Encode the rule in a type, name or test; if it is a non-obvious why, use // WHY: (budget ${left} left).`;

test("a repo with no WHY comments has the whole budget of 10 left", async (t) => {
  const root = repoWith(t, { "src/domain/a.ts": "export const a = 1;\n" });
  assert.deepEqual(await lintMessages(root, "src/domain/b.ts", note), [banned(10)]);
});

test("WHY and SAFETY comments in every file of the repo use up the budget", async (t) => {
  const root = repoWith(t, {
    "src/domain/a.ts": whyComments(4),
    "src/db/b.ts": "// SAFETY: checked by the caller.\nexport const b = 1;\n",
    "scripts/c.mjs": whyComments(2),
  });
  assert.deepEqual(await lintMessages(root, "src/domain/d.ts", note), [banned(3)]);
});

test("ten WHY comments across the repo pass and leave nothing", async (t) => {
  const root = repoWith(t, { "src/domain/a.ts": whyComments(6), "src/db/b.ts": whyComments(4) });
  assert.deepEqual(await lintMessages(root, "src/domain/a.ts", whyComments(6)), []);
  assert.deepEqual(await lintMessages(root, "src/domain/d.ts", note), [banned(0)]);
});

test("the eleventh WHY comment in the repo fails every WHY comment", async (t) => {
  const root = repoWith(t, { "src/domain/a.ts": whyComments(6), "src/db/b.ts": whyComments(5) });
  const overBudget =
    "This repo has 11 // WHY: and // SAFETY: comments and the budget is 10. Delete 1 of them: encode each rule in a type, name or test.";
  assert.deepEqual(await lintMessages(root, "src/db/b.ts", whyComments(5)), Array.from({ length: 5 }, () => overBudget));
});

test("comments in node_modules and dist do not count", async (t) => {
  const root = repoWith(t, {
    "src/domain/a.ts": whyComments(1),
    "node_modules/dependency/index.js": whyComments(20),
    "dist/bundle.mjs": whyComments(20),
  });
  assert.deepEqual(await lintMessages(root, "src/domain/d.ts", note), [banned(9)]);
});

test("comments in a directory the repo ignores do not count", async (t) => {
  const root = repoWith(t, { "src/domain/a.ts": whyComments(1), "vendor/library/index.js": whyComments(20) });
  assert.deepEqual(await lintMessages(root, "src/domain/d.ts", note), [banned(0)]);
  assert.deepEqual(await lintMessages(root, "src/domain/d.ts", note, { ignores: ["vendor/**"] }), [banned(9)]);
});
