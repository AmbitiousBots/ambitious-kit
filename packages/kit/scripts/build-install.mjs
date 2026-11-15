import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { build } from "esbuild";
import { foldWhitespace } from "../src/domain/whitespace.ts";
import { routinesOf } from "./template-routines.mjs";
import { INSTALLER_PIN_TOKEN, skillsOf } from "./template-skills.mjs";

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
  oldestSupported: published.oldestSupported,
  text: instructionsText,
  known: published.versions.flatMap(({ version, sha256, whitespaceSha256, variants }) => [{ sha256, whitespaceSha256 }, ...variants].map((text) => ({ version, sha256: text.sha256, whitespaceSha256: text.whitespaceSha256 }))),
  grants: published.grants,
  versions: published.versions.map(({ version, grants, reasons }) => ({ version, grants, reasons })),
};
const recorded = published.versions.find(({ version }) => version === published.current)?.sha256;
if (recorded !== createHash("sha256").update(instructionsText).digest("hex")) {
  throw new Error(
    `template/INSTRUCTIONS.md is not the text recorded for instructions version ${published.current} in template/instructions.json. ` +
      'A changed text is a new version: raise its "Instructions version" line, keep the old text under template/instructions/, and add the new version with its SHA-256 and grants to instructions.json.',
  );
}

const sha256Of = (text) => createHash("sha256").update(text).digest("hex");
const promptHistory = JSON.parse(readFileSync(join(template, "routines.json"), "utf8"));
const routines = routinesOf(readFileSync(join(template, "routines.md"), "utf8")).map(({ name, schedule, paused, prompt }) => {
  const history = promptHistory[name];
  const whitespaceSha256 = sha256Of(foldWhitespace(prompt));
  if (history?.current.whitespaceSha256 !== whitespaceSha256) {
    throw new Error(
      `The prompt of the routine ${name} in template/routines.md is not the one recorded as current in template/routines.json. ` +
        'A changed prompt is a new entry: move the recorded "current" entry into "earlier", and record the new prompt as "current" with this template version and the SHA-256 the installer compares.',
    );
  }
  return {
    name,
    schedule,
    paused,
    prompt,
    sha256: sha256Of(prompt),
    whitespaceSha256,
    variants: history.current.variants.map((variant) => variant.whitespaceSha256),
    earlier: history.earlier.flatMap(({ firstTemplate, whitespaceSha256: hash, variants }) => [
      { template: firstTemplate, whitespaceSha256: hash, variant: false },
      ...variants.map((variant) => ({ template: firstTemplate, whitespaceSha256: variant.whitespaceSha256, variant: true })),
    ]),
  };
});

const skills = skillsOf(template, version, INSTALLER_PIN_TOKEN);

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
  define: { ...defineFor("modules"), AMBITIOUS_LOCK: JSON.stringify(JSON.parse(lock)), AMBITIOUS_TEMPLATE_FILES: JSON.stringify(templateFiles), AMBITIOUS_INSTRUCTIONS: JSON.stringify(instructions), AMBITIOUS_ROUTINES: JSON.stringify(routines), AMBITIOUS_SKILLS: JSON.stringify(skills) },
});
