import { createHash } from "node:crypto";
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
    .map((name) => [`fixtures/${name}`, readFileSync(join(fixtures, name), "utf8")]),
);

const published = JSON.parse(readFileSync(join(template, "instructions.json"), "utf8"));
const instructionsText = readFileSync(join(template, "INSTRUCTIONS.md"), "utf8");
const instructions = {
  version: published.current,
  text: instructionsText,
  known: published.versions.flatMap(({ version, sha256, variants }) => [sha256, ...variants.map((variant) => variant.sha256)].map((hash) => ({ version, sha256: hash }))),
};
const recorded = published.versions.find(({ version }) => version === published.current)?.sha256;
if (recorded !== createHash("sha256").update(instructionsText).digest("hex")) {
  throw new Error(
    `template/INSTRUCTIONS.md is not the text recorded for instructions version ${published.current} in template/instructions.json. ` +
      'A changed text is a new version: raise its "Instructions version" line, keep the old text under template/instructions/, and add the new version with its SHA-256 and grants to instructions.json.',
  );
}

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
  define: { ...defineFor("modules"), AMBITIOUS_LOCK: JSON.stringify(JSON.parse(lock)), AMBITIOUS_TEMPLATE_FILES: JSON.stringify(templateFiles), AMBITIOUS_INSTRUCTIONS: JSON.stringify(instructions) },
});
