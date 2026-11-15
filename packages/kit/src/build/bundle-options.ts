import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isModuleName, isSemver } from "../domain/envelope.ts";
import { isRecord } from "../domain/json.ts";
import { loadMigrations } from "../db/load-migrations.ts";

export type BundleOptions = {
  readonly entryPoints: string[];
  readonly outfile: string;
  readonly bundle: true;
  readonly platform: "node";
  readonly format: "esm";
  readonly target: "node24";
  readonly legalComments: "none";
  readonly banner: { readonly js: string };
  readonly define: Record<string, string>;
};

const packageVersion = (root: string): string => {
  const manifest: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const version = isRecord(manifest) ? manifest.version : undefined;
  if (typeof version !== "string" || !isSemver(version)) {
    throw new Error(`package.json in ${root} needs a semantic "version"; it becomes meta.version in every envelope.`);
  }
  return version;
};

export const bundleOptions = ({ root, module }: { readonly root: string; readonly module: string }): BundleOptions => {
  if (!isModuleName(module)) throw new Error(`"${module}" is not a module name: use the lower-case name after ambitious-.`);
  return {
    entryPoints: [join(root, "src", "cli", "main.ts")],
    outfile: join(root, "dist", `ambitious-${module}.mjs`),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    legalComments: "none",
    banner: { js: "#!/usr/bin/env node" },
    define: {
      AMBITIOUS_MODULE: JSON.stringify(module),
      AMBITIOUS_VERSION: JSON.stringify(packageVersion(root)),
      AMBITIOUS_MIGRATIONS: JSON.stringify(loadMigrations(join(root, "migrations"))),
    },
  };
};
