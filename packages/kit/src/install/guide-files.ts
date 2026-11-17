import { join } from "node:path";
import type { Guide } from "../domain/guides.ts";
import { placeTemplateFiles, templateDirectory } from "./template-files.ts";

const fileOf = (topic: string): string => `guides/${topic}.md`;

export const guidesDirectory = (home: string): string => join(templateDirectory(home), "guides");

export const placeGuideFile = (home: string, { topic, text }: Guide): string => join(placeTemplateFiles(home, new Map([[fileOf(topic), text]])), fileOf(topic));
