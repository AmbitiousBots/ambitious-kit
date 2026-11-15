import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { failure } from "../domain/failure.ts";
import { classifyInstructions, lineDiff, normalizeInstructions, type InstructionsCatalogue, type InstructionsFinding } from "../domain/instructions.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";

export const PROPOSED_INSTRUCTIONS_FILE = "instructions.md";

const MAX_BYTES = 256 * 1024;

const HINT =
  "Write the bot's current instructions, exactly as they are, to a text file outside the bot's private data directory and name that file with --instructions.";

export type InstructionsReport =
  | { readonly state: "not checked"; readonly problem: null; readonly current: null; readonly template: number; readonly proposed: string; readonly diff: readonly string[] }
  | (InstructionsFinding & { readonly proposed: string; readonly diff: readonly string[] });

export const proposedInstructionsPath = (home: string): string => join(home, "template", PROPOSED_INSTRUCTIONS_FILE);

export const sha256OfInstructions = (normalized: string): string => createHash("sha256").update(normalized).digest("hex");

const textOf = (file: string): string => {
  const path = refuseAgentData(file);
  try {
    if (statSync(path).size > MAX_BYTES) throw new Error(`it is larger than ${MAX_BYTES} bytes`);
    return readFileSync(path, "utf8");
  } catch (error) {
    throw failure("E_INPUT_SCHEMA", `The instructions file ${file} could not be read: ${error instanceof Error ? error.message : String(error)}.`, HINT);
  }
};

export const checkInstructions = (file: string | null, home: string, catalogue: InstructionsCatalogue): InstructionsReport => {
  const proposed = proposedInstructionsPath(home);
  if (file === null) return { state: "not checked", problem: null, current: null, template: catalogue.version, proposed, diff: [] };
  const normalized = normalizeInstructions(textOf(file));
  const finding = classifyInstructions(normalized, sha256OfInstructions(normalized), catalogue);
  return { ...finding, proposed, diff: finding.state === "current" || finding.state === "newer" ? [] : lineDiff(normalized, catalogue.text) };
};
