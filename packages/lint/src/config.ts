import parser from "@typescript-eslint/parser";
import type { ESLint, Linter } from "eslint";
import { bans, restrictions } from "./bans.ts";
import { COMMENT_BUDGET, countBudgetComments } from "./budget.ts";
import { noBarrelFiles } from "./no-barrel-files.ts";
import { noComments } from "./no-comments.ts";

export type Options = {
  readonly root: string;
  readonly ignores?: readonly string[];
  readonly defaultExportFiles?: readonly string[];
};

const SOURCE_FILES = ["**/*.{ts,mts,cts,tsx,js,mjs,cjs,jsx}"];
const ALWAYS_IGNORED = ["**/node_modules/**", "**/dist/**"];
const TOOL_CONFIG_FILES = ["**/*.config.{ts,mts,js,mjs}", "**/.dependency-cruiser.mjs"];

const plugin: ESLint.Plugin = {
  rules: { "no-comments": noComments, "no-barrel-files": noBarrelFiles },
};

export const ambitiousLint = ({ root, ignores = [], defaultExportFiles = [] }: Options): Linter.Config[] => {
  const allIgnores = [...ALWAYS_IGNORED, ...ignores];
  const allBans = bans([...TOOL_CONFIG_FILES, ...defaultExportFiles]);
  const zones = [...new Set(allBans.map(({ allowedIn }) => allowedIn).filter((files) => files.length > 0))];

  return [
    { ignores: allIgnores },
    {
      files: SOURCE_FILES,
      languageOptions: { parser, ecmaVersion: "latest", sourceType: "module" },
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: "error" },
      plugins: { ambitious: plugin },
      rules: {
        "ambitious/no-comments": ["error", { budget: COMMENT_BUDGET, used: countBudgetComments(root, allIgnores) }],
        "ambitious/no-barrel-files": "error",
        ...restrictions(allBans),
      },
    },
    { files: ["**/*.cjs"], languageOptions: { sourceType: "commonjs" } },
    ...zones.map((files) => ({
      files: [...files],
      rules: restrictions(allBans.filter(({ allowedIn }) => allowedIn !== files)),
    })),
  ];
};
