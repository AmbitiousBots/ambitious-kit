#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const USAGE = `Usage: node scripts/with-pinned-tools.mjs <command> [arguments...]

Runs a command with the tool versions pinned in .mise.toml (Node, Python and
Java) first on PATH, and with PYTHONPATH pointing at packages/kit-python when
that directory exists. Use it for anything that starts python3, so the
pinned Python runs and not whichever one the machine happens to have.

Needs mise (https://mise.jdx.dev): run "mise trust && mise install" once in
the repository.

Exit code: the command's own, or 2 when the pinned tools cannot be read.
`;

const repoRoot = join(import.meta.dirname, "..");
const [command, ...commandArguments] = process.argv.slice(2);

const pinnedEnvironment = () => {
  try {
    return JSON.parse(
      execFileSync("mise", ["env", "--json"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
    );
  } catch (error) {
    process.stderr.write(
      `Cannot read the pinned tools from .mise.toml: ${String(error.stderr || error.message).trim()}\n` +
        `Install mise (https://mise.jdx.dev), then run "mise trust && mise install" in this repository.\n`,
    );
    return null;
  }
};

if (command === undefined || command === "--help") {
  (command === undefined ? process.stderr : process.stdout).write(USAGE);
  process.exitCode = command === undefined ? 2 : 0;
} else {
  const pinned = pinnedEnvironment();
  if (pinned === null) {
    process.exitCode = 2;
  } else {
    const result = spawnSync(command, commandArguments, {
      stdio: "inherit",
      env: { ...process.env, ...pinned, PYTHONPATH: join(repoRoot, "packages", "kit-python") },
    });
    if (result.error !== undefined) process.stderr.write(`Cannot start ${command}: ${result.error.message}\n`);
    process.exitCode = result.status ?? 2;
  }
}
