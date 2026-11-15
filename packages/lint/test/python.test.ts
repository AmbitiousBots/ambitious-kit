import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";

const pythonDir = join(import.meta.dirname, "..", "python");
const checker = join(pythonDir, "check_comments.py");

type Run = { readonly exitCode: number | null; readonly lines: readonly string[] };

const check = (root: string, ...flags: readonly string[]): Run => {
  const result = spawnSync("python3", [checker, root, ...flags], { encoding: "utf8" });
  assert.equal(result.stderr, "");
  return { exitCode: result.status, lines: result.stdout.split("\n").filter((line) => line !== "") };
};

const repoWith = (t: TestContext, files: Readonly<Record<string, string>>): string => {
  const root = mkdtempSync(join(tmpdir(), "ambitious-lint-python-"));
  t.after(() => rmSync(root, { recursive: true }));
  for (const [file, code] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), code);
  }
  return root;
};

const banned = (place: string, left: number): string =>
  `${place}: Delete the comment. Encode the rule in a type, name or test; if it is a non-obvious why, use # WHY: (budget ${left} left).`;

const whyComments = (count: number): string =>
  Array.from({ length: count }, (_, index) => `# WHY: reason number ${index}.\nvalue_${index} = ${index}\n`).join("");

type Case = { readonly name: string; readonly code: string; readonly fails: readonly number[] };

const cases: readonly Case[] = [
  { name: "line comment", code: "# note\na = 1\n", fails: [1] },
  { name: "trailing comment", code: "a = 1  # note\n", fails: [1] },
  { name: "module docstring", code: '"""Adds numbers."""\na = 1\n', fails: [1] },
  { name: "function docstring", code: 'def add(a: int) -> int:\n    """Add one."""\n    return a + 1\n', fails: [2] },
  { name: "string used as a comment", code: 'a = 1\n"remember to change this"\n', fails: [2] },
  { name: "noqa", code: "import os  # noqa: F401\n", fails: [1] },
  { name: "type: ignore without a reason", code: "a: int = 'x'  # type: ignore[assignment]\n", fails: [1] },
  { name: "bare type: ignore", code: "a: int = 'x'  # type: ignore\n", fails: [1] },
  { name: "WHY after code on the same line", code: "a = 1  # WHY: the vendor rounds half down.\n", fails: [1] },
  { name: "WHY with a blank line before code", code: "# WHY: the vendor rounds half down.\n\na = 1\n", fails: [1] },
  { name: "WHY at the end of the file", code: "a = 1\n# WHY: the vendor rounds half down.\n", fails: [2] },
  { name: "comment after the license header", code: "# SPDX-License-Identifier: Apache-2.0\n\n# note\na = 1\n", fails: [3] },
  { name: "clean code", code: "def add(a: int) -> int:\n    return a + 1\n", fails: [] },
  { name: "a string that holds a hash", code: 'a = "# not a comment"\n', fails: [] },
  { name: "WHY above code", code: "# WHY: the vendor rounds half down.\na = 1\n", fails: [] },
  { name: "SAFETY above code", code: "def f() -> int:\n    # SAFETY: the id is checked by the caller.\n    return 1\n", fails: [] },
  { name: "shebang", code: "#!/usr/bin/env python3\na = 1\n", fails: [] },
  {
    name: "license header after a shebang",
    code: "#!/usr/bin/env python3\n# Copyright 2026 Example Corporation\n# SPDX-License-Identifier: Apache-2.0\n\na = 1\n",
    fails: [],
  },
  {
    name: "type: ignore with an error code and a reason",
    code: "a: int = 'x'  # type: ignore[assignment]  # the test passes a string on purpose\n",
    fails: [],
  },
];

for (const { name, code, fails } of cases) {
  test(`python ${fails.length === 0 ? "passes" : "fails"}: ${name}`, (t) => {
    const run = check(repoWith(t, { "pkg/domain/a.py": code }));
    assert.deepEqual(run.lines, fails.map((line) => banned(`pkg/domain/a.py:${line}`, 10)));
    assert.equal(run.exitCode, fails.length === 0 ? 0 : 1);
  });
}

test("python: WHY comments across the repo use up the budget", (t) => {
  const root = repoWith(t, { "pkg/domain/a.py": whyComments(4), "pkg/db/b.py": whyComments(3), "pkg/cli/c.py": "# note\na = 1\n" });
  assert.deepEqual(check(root), { exitCode: 1, lines: [banned("pkg/cli/c.py:1", 3)] });
});

test("python: ten WHY comments pass and the eleventh fails every one", (t) => {
  assert.deepEqual(check(repoWith(t, { "pkg/a.py": whyComments(6), "pkg/b.py": whyComments(4) })), { exitCode: 0, lines: [] });

  const over = check(repoWith(t, { "pkg/a.py": whyComments(6), "pkg/b.py": whyComments(5) }));
  assert.equal(over.exitCode, 1);
  assert.equal(over.lines.length, 11);
  assert.equal(
    over.lines[0],
    "pkg/a.py:1: This repo has 11 # WHY: and # SAFETY: comments and the budget is 10. Delete 1 of them: encode each rule in a type, name or test.",
  );
});

test("python: virtualenvs and excluded directories are not checked", (t) => {
  const root = repoWith(t, { "pkg/a.py": "a = 1\n", ".venv/lib/x.py": "# note\n", "vendor/y.py": "# note\n" });
  assert.deepEqual(check(root), { exitCode: 1, lines: [banned("vendor/y.py:1", 10)] });
  assert.deepEqual(check(root, "--exclude", "vendor"), { exitCode: 0, lines: [] });
});

test("python: the checker passes its own rules", () => {
  assert.deepEqual(check(pythonDir), { exitCode: 0, lines: [] });
});
