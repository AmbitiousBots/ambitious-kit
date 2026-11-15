import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const INSTALLER_SKILL = "ambitious-module-installer";
export const INSTALLER_PIN_TOKEN = "0".repeat(64);

const VERSION_LINE = /^Template version: [0-9]+\.[0-9]+\.[0-9]+$/m;
const SEMVER = "[0-9]+\\.[0-9]+\\.[0-9]+";

export const skillFile = (template, name) => join(template, "skills", name, "SKILL.md");

export const skillNames = (template) =>
  readdirSync(join(template, "skills"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

export const versioned = (text, version, where) => {
  if (!VERSION_LINE.test(text)) throw new Error(`${where} needs a "Template version: x.y.z" line for the generator to keep current.`);
  return text.replace(VERSION_LINE, `Template version: ${version}`);
};

export const pinned = (text, version, sha256) => {
  const result = text
    .replace(new RegExp(`kit-v${SEMVER}`, "g"), `kit-v${version}`)
    .replace(new RegExp(`ambitious-modules-${SEMVER}\\.mjs`, "g"), `ambitious-modules-${version}.mjs`)
    .replace(/[0-9a-f]{64}(?= {2}ambitious-modules-)/g, sha256);
  if (!result.includes(`${sha256}  ambitious-modules-${version}.mjs`)) {
    throw new Error(`skills/${INSTALLER_SKILL}/SKILL.md has no sha256sum line for the bundled installer to pin.`);
  }
  return result;
};

export const frontmatter = (text, where) => {
  const match = /^---\n([\s\S]*?)\n---\n+([\s\S]*)$/.exec(text);
  if (match === null) throw new Error(`${where} must start with frontmatter between --- lines.`);
  const value = (field) => {
    const line = new RegExp(`^${field}:[ \\t]*(.+?)[ \\t]*$`, "m").exec(match[1]);
    if (line === null) throw new Error(`${where} needs a "${field}" in its frontmatter.`);
    return line[1].replace(/^(['"])(.*)\1$/, "$2");
  };
  return { name: value("name"), description: value("description"), body: match[2] };
};

export const skillText = (template, name, version, installerSha256) => {
  const where = `skills/${name}/SKILL.md`;
  const text = versioned(readFileSync(skillFile(template, name), "utf8"), version, where);
  return name === INSTALLER_SKILL ? pinned(text, version, installerSha256) : text;
};

export const skillsOf = (template, version, installerSha256) =>
  skillNames(template).map((name) => {
    const where = `skills/${name}/SKILL.md`;
    const skill = frontmatter(skillText(template, name, version, installerSha256), where);
    if (!skill.body.startsWith(`Template version: ${version}\n`)) throw new Error(`${where}: the first line of the body must be "Template version: ${version}".`);
    return skill;
  });
