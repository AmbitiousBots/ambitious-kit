import { join } from "node:path";
import type { TemplateSkill } from "../domain/template-skills.ts";
import { placeTemplateFiles, templateDirectory } from "./template-files.ts";
import { sha256Of } from "./text-file.ts";

export type SkillFile = { readonly name: string; readonly description: string; readonly path: string; readonly sha256: string; readonly bytes: number };

const fileOf = (name: string): string => `skills/${name}.md`;

export const skillsDirectory = (home: string): string => join(templateDirectory(home), "skills");

export const placeSkillFiles = (home: string, skills: readonly TemplateSkill[]): readonly SkillFile[] => {
  const root = placeTemplateFiles(home, new Map(skills.map(({ name, body }) => [fileOf(name), body])));
  return skills.map(({ name, description, body }) => ({ name, description, path: join(root, fileOf(name)), sha256: sha256Of(body), bytes: Buffer.byteLength(body, "utf8") }));
};
