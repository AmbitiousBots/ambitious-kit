import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "esbuild";

const root = join(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

await build({
  entryPoints: [join(root, "src", "cli", "install-main.ts")],
  outfile: join(root, "dist", "ambitious-install.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" },
  define: {
    AMBITIOUS_MODULE: JSON.stringify("install"),
    AMBITIOUS_VERSION: JSON.stringify(version),
    AMBITIOUS_MIGRATIONS: "[]",
  },
});
