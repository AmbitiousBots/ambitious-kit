import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { failure } from "../domain/failure.ts";
import { foldWhitespace, type Fingerprint } from "../domain/whitespace.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";

const MAX_BYTES = 256 * 1024;

const sha256Of = (text: string): string => createHash("sha256").update(text).digest("hex");

export const fingerprintOf = (text: string): Fingerprint => ({ sha256: sha256Of(text), whitespaceSha256: sha256Of(foldWhitespace(text)) });

export const textOfFile = (file: string, what: string, hint: string): string => {
  const path = refuseAgentData(file);
  try {
    if (statSync(path).size > MAX_BYTES) throw new Error(`it is larger than ${MAX_BYTES} bytes`);
    return readFileSync(path, "utf8");
  } catch (error) {
    throw failure("E_INPUT_SCHEMA", `${what} ${file} could not be read: ${error instanceof Error ? error.message : String(error)}.`, hint);
  }
};
