import { constants, copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { parseArgs } from "node:util";

const templateDir = join(import.meta.dirname, "..", "repo-template");
const FORBIDDEN_ROOT = "/home/box/agent-data";

const USAGE = "Usage: node scripts/apply-template.mjs <target-repo-directory> [--dry-run]";

const fail = (message) => {
  process.stderr.write(`${message}\n`);
  process.exit(1);
};

const exists = (path) => lstatSync(path, { throwIfNoEntry: false }) !== undefined;

const isInside = (path, directory) => path === directory || path.startsWith(`${directory}${sep}`);

const nearestExistingDirectory = (path) => (exists(path) ? path : nearestExistingDirectory(dirname(path)));

const templateFiles = () =>
  readdirSync(templateDir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(templateDir, join(entry.parentPath, entry.name)))
    .sort();

const parsed = (() => {
  try {
    return parseArgs({ allowPositionals: true, options: { "dry-run": { type: "boolean", default: false } } });
  } catch (error) {
    return fail(`${error instanceof Error ? error.message : error}\n${USAGE}`);
  }
})();

const [targetArgument, ...extra] = parsed.positionals;
if (targetArgument === undefined || extra.length > 0) fail(USAGE);
if (!lstatSync(targetArgument, { throwIfNoEntry: false })?.isDirectory()) {
  fail(`${targetArgument} is not a directory. Create or clone the target repo first.`);
}

const target = realpathSync(targetArgument);
if (isInside(target, FORBIDDEN_ROOT)) fail(`${target} is under ${FORBIDDEN_ROOT}, which is never read or written.`);

const plan = templateFiles().map((file) => {
  const destination = join(target, file);
  if (exists(destination)) return { file, destination, action: "kept" };
  const parent = realpathSync(nearestExistingDirectory(dirname(destination)));
  return { file, destination, action: isInside(parent, target) ? "created" : "refused" };
});

const refused = plan.filter(({ action }) => action === "refused");
if (refused.length > 0) {
  fail(
    `Nothing was written. These paths lead outside ${target} through a symbolic link:\n` +
      refused.map(({ file }) => `  ${file}`).join("\n"),
  );
}

const dryRun = parsed.values["dry-run"];
for (const { file, destination, action } of plan) {
  if (action === "created" && !dryRun) {
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(join(templateDir, file), destination, constants.COPYFILE_EXCL);
  }
  process.stdout.write(`${action === "created" && dryRun ? "would create" : action}  ${file}\n`);
}

const created = plan.filter(({ action }) => action === "created").length;
process.stdout.write(
  `${dryRun ? "Dry run for" : "Applied repo template to"} ${target}: ` +
    `${created} ${dryRun ? "to create" : "created"}, ${plan.length - created} kept (existing files are never overwritten).\n`,
);
