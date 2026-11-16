import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isRecord } from "../domain/json.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";
import { placeByRename, refuseNonRegularFile } from "./install.ts";

export type TemplateFiles = ReadonlyMap<string, string>;

const FILE_NAME = /^[a-z0-9][a-z0-9.-]*(?:\/[a-z0-9][a-z0-9.-]*)*$/;

export const parseTemplateFiles = (value: unknown): TemplateFiles => {
  if (!isRecord(value)) throw new Error("The embedded template files must be an object of file name to text.");
  return new Map(
    Object.entries(value).map(([name, text]) => {
      if (!FILE_NAME.test(name) || typeof text !== "string") throw new Error(`The embedded template file "${name}" needs a lower-case relative name and text content.`);
      return [name, text] as const;
    }),
  );
};

const textIfPresent = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

export const templateDirectory = (home: string): string => join(home, "template");

export const fixturesDirectory = (home: string): string => join(templateDirectory(home), "fixtures");

export const placeTemplateFiles = (home: string, files: TemplateFiles): string => {
  const root = templateDirectory(refuseAgentData(home));
  for (const [name, text] of files) {
    const path = join(root, name);
    refuseNonRegularFile(path);
    if (textIfPresent(path) === text) continue;
    mkdirSync(dirname(path), { recursive: true });
    placeByRename(dirname(path), name.slice(name.lastIndexOf("/") + 1), (descriptor) => writeFileSync(descriptor, text));
  }
  return root;
};
