import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { failure } from "../domain/failure.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";
import type { Download } from "./install.ts";

const fromDirectory = (directory: string): Download => {
  const root = refuseAgentData(directory);
  return async (fileName) => readFile(join(root, fileName));
};

const fromWeb = (base: string): Download => async (fileName) => {
  const response = await fetch(`${base.replace(/\/+$/, "")}/${fileName}`, { redirect: "follow" });
  if (!response.ok) throw new Error(`the server answered ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

export const releaseSource = (from: string): Download => {
  if (from.startsWith("https://")) return fromWeb(from);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(from)) {
    throw failure("E_USAGE", `The release address ${from} is not an https address.`, "Give an https:// address or the path of a directory that holds the release files.");
  }
  return fromDirectory(from);
};
