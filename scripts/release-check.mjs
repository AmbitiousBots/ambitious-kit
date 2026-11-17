#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const USAGE = `Usage: node scripts/release-check.mjs

Runs every check a kit release must pass, in order, and ends with one table.
Every step runs even when an earlier one failed, so one run shows everything
that is wrong. Needs the pinned tools: run "mise trust && mise install" and
"npm ci" first.

Exit code 0: every step passed. 1: at least one failed. 2: could not run.
`;

const repoRoot = join(import.meta.dirname, "..");

const STEPS = [
  ["typecheck", "TypeScript types are consistent"],
  ["lint", "the lint rules and the standalone check hold for every file"],
  ["lint:python", "the Python kit has no code comments"],
  ["check:standalone", "nothing points at a private plan or at one machine"],
  ["depcruise", "every import follows the directory rules"],
  ["check:contract", "the envelope examples and the contract agree with the schema"],
  ["test", "the unit tests pass, including the contract tests on broken binaries"],
  ["contract -- examples/hello/dist/ambitious-hello.mjs", "the example module passes the contract tests"],
  ["build:python", "the Python example module builds"],
  ["test:python", "the Python kit's tests pass"],
  ["contract:python", "the Python and TypeScript contract tests each pass the other's module"],
  ["tlc", "every TLA+ model passes and every broken variant is caught"],
  ["verify", "every user-visible feature passes against a fresh AMBITIOUS_HOME"],
  ["template:generate -- --check", "the generated template files are up to date, and the skills and routine prompts fit the size budget"],
  ["template:test", "the bot template is complete, its pins match the published releases, and the pinned modules install and selfcheck"],
  ["release:build", "the release files build"],
];

const pinnedEnvironment = () => {
  try {
    return JSON.parse(execFileSync("mise", ["env", "--json"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (error) {
    process.stderr.write(
      `Cannot read the pinned tools from .mise.toml: ${String(error.stderr || error.message).trim()}\n` +
        `Install mise (https://mise.jdx.dev), then run "mise trust && mise install" in this repository.\n`,
    );
    return null;
  }
};

const table = (rows) => {
  const header = ["Step", "Result", "What it shows"];
  const cells = [header, ...rows];
  const widths = header.map((_, column) => Math.max(...cells.map((line) => line[column].length)));
  const format = (line) => line.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd();
  return [format(header), widths.map((width) => "-".repeat(width)).join("  "), ...rows.map(format)].join("\n");
};

const run = () => {
  const pinned = pinnedEnvironment();
  if (pinned === null) return 2;
  const env = { ...process.env, ...pinned };
  const results = STEPS.map(([script, shows]) => {
    process.stdout.write(`\n=== npm run ${script}\n`);
    const { status } = spawnSync("npm", ["run", "--silent", ...script.split(" ")], { cwd: repoRoot, stdio: "inherit", env });
    return { script, shows, passed: status === 0 };
  });
  const failed = results.filter(({ passed }) => !passed);
  process.stdout.write(`\n${table(results.map(({ script, shows, passed }) => [`npm run ${script}`, passed ? "pass" : "FAIL", shows]))}\n\n`);
  process.stdout.write(
    failed.length === 0
      ? `release check: ok. ${results.length} of ${results.length} steps passed.\n`
      : `release check: ${failed.length} of ${results.length} steps failed: ${failed.map(({ script }) => script).join(", ")}.\n`,
  );
  return failed.length === 0 ? 0 : 1;
};

if (process.argv.length > 2) {
  (process.argv[2] === "--help" ? process.stdout : process.stderr).write(USAGE);
  process.exitCode = process.argv[2] === "--help" ? 0 : 2;
} else {
  process.exitCode = run();
}
