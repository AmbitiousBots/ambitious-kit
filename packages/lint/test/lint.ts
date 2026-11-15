import { join } from "node:path";
import { ESLint } from "eslint";
import { ambitiousLint } from "../src/config.ts";

export const cleanRepo = join(import.meta.dirname, "fixtures", "clean-repo");

export const lintMessages = async (root: string, file: string, code: string): Promise<string[]> => {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: ambitiousLint({ root }) });
  const results = await eslint.lintText(code, { filePath: join(root, file) });
  return results.flatMap((result) => result.messages.filter(({ severity }) => severity === 2).map(({ message }) => message));
};
