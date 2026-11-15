import { runContract } from "../contract/checks.ts";

const USAGE = `Usage: ambitious-contract <path to the built module binary>

Runs the module contract tests against a built binary (.mjs, .pyz or any
executable) and prints one row per check. Each check uses its own fresh,
temporary AMBITIOUS_HOME. Exit code 0: every check passed. 1: a check failed.
2: the tests could not run.
`;

export const contractMain = (argv: readonly string[]): number => {
  const [binPath, ...extra] = argv;
  if (binPath === undefined || binPath.startsWith("--") || extra.length > 0) {
    (binPath === "--help" ? process.stdout : process.stderr).write(USAGE);
    return binPath === "--help" ? 0 : 2;
  }
  const results = runContract(binPath);
  const width = Math.max(...results.map(({ id }) => id.length));
  for (const { id, title, problems } of results) {
    process.stdout.write(`${problems.length === 0 ? "ok  " : "FAIL"}  ${id.padEnd(width)}  ${title}\n`);
    for (const problem of problems) process.stdout.write(`      ${problem}\n`);
  }
  const failed = results.filter(({ problems }) => problems.length > 0).length;
  process.stdout.write(
    failed === 0
      ? `contract: ok. ${results.length} of ${results.length} checks passed for ${binPath}.\n`
      : `contract: ${failed} of ${results.length} checks failed for ${binPath}.\n`,
  );
  return failed === 0 ? 0 : 1;
};
