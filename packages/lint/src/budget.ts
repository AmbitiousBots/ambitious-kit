import { readdirSync, readFileSync } from "node:fs";
import { join, matchesGlob, relative } from "node:path";

export const COMMENT_BUDGET = 10;

export const BUDGET_COMMENT = /^ (SAFETY|WHY): \S/;

const BUDGET_LINE = /^\s*\/\/ (SAFETY|WHY): \S/gm;
const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const NEVER_SCANNED = new Set(["node_modules", ".git"]);

const sourceFiles = (root: string, ignores: readonly string[]): string[] => {
  const ignored = (path: string): boolean => ignores.some((glob) => matchesGlob(relative(root, path), glob));
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return NEVER_SCANNED.has(entry.name) ? [] : walk(path);
      return entry.isFile() && SOURCE_FILE.test(entry.name) && !ignored(path) ? [path] : [];
    });
  return walk(root);
};

export const countBudgetComments = (root: string, ignores: readonly string[]): number =>
  sourceFiles(root, ignores)
    .map((path) => readFileSync(path, "utf8").match(BUDGET_LINE)?.length ?? 0)
    .reduce((total, count) => total + count, 0);
