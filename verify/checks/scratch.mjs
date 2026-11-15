import { spawnSync } from "node:child_process";
import { join } from "node:path";

export const repoRoot = join(import.meta.dirname, "..", "..");

export const sh = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(`$ ${[command, ...args].join(" ")}\n${output}exit ${result.status}\n`);
  return { status: result.status, stdout: result.stdout ?? "", output };
};

export const must = (holds, claim) => {
  process.stdout.write(`${holds ? "ok  " : "FAIL"}  ${claim}\n`);
  if (!holds) process.exitCode = 1;
};
