import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { build } from "esbuild";

const root = join(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

const template = join(root, "..", "..", "template");
const lock = readFileSync(join(template, "modules.lock.json"), "utf8");
const fixtures = join(template, "fixtures");
const templateFiles = Object.fromEntries(
  readdirSync(fixtures, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(fixtures, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort()
    .map((name) => [name, readFileSync(join(fixtures, name), "utf8")]),
);

const shared = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  legalComments: "none",
  banner: { js: "#!/usr/bin/env node" },
};

const defineFor = (module) => ({
  AMBITIOUS_MODULE: JSON.stringify(module),
  AMBITIOUS_VERSION: JSON.stringify(version),
  AMBITIOUS_MIGRATIONS: "[]",
});

await build({
  ...shared,
  entryPoints: [join(root, "src", "cli", "install-main.ts")],
  outfile: join(root, "dist", "ambitious-install.mjs"),
  define: defineFor("install"),
});

await build({
  ...shared,
  entryPoints: [join(root, "src", "cli", "modules-main.ts")],
  outfile: join(root, "dist", "ambitious-modules.mjs"),
  define: { ...defineFor("modules"), AMBITIOUS_LOCK: JSON.stringify(JSON.parse(lock)), AMBITIOUS_TEMPLATE_FILES: JSON.stringify(templateFiles) },
});
