import { isRecord } from "./json.ts";

export type TemplateSkill = { readonly name: string; readonly description: string; readonly body: string };

export const INSTALLER_PIN_TOKEN = "0".repeat(64);

const PINNED_FILE = "  ambitious-modules-";
const SKILL_NAME = /^ambitious-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export const withInstallerPin = (skills: readonly TemplateSkill[], installerSha256: string): readonly TemplateSkill[] =>
  skills.map((skill) => ({ ...skill, body: skill.body.replaceAll(`${INSTALLER_PIN_TOKEN}${PINNED_FILE}`, `${installerSha256}${PINNED_FILE}`) }));

export const parseTemplateSkills = (value: unknown): readonly TemplateSkill[] => {
  if (!Array.isArray(value)) throw new Error("The embedded template skills must be a list.");
  return value.map((entry: unknown): TemplateSkill => {
    if (!isRecord(entry) || typeof entry.name !== "string" || !SKILL_NAME.test(entry.name) || typeof entry.description !== "string" || typeof entry.body !== "string" || entry.body === "") {
      throw new Error("Each embedded template skill needs a name starting with ambitious-, a description and a body.");
    }
    return { name: entry.name, description: entry.description, body: entry.body };
  });
};
