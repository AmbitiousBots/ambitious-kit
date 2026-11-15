import { join } from "node:path";
import { classifyInstructions, lineDiff, permissionChange, upgradeAuthority, type InstructionsCatalogue, type InstructionsFinding, type PermissionChange, type UpgradeAuthority } from "../domain/instructions.ts";
import { foldWhitespace } from "../domain/whitespace.ts";
import { fingerprintOf, textOfFile } from "./text-file.ts";

export const PROPOSED_INSTRUCTIONS_FILE = "instructions.md";

const HINT =
  "Write the bot's current instructions, exactly as they are, to a text file outside the bot's private data directory and name that file with --instructions.";

type Compared = { readonly proposed: string; readonly diff: readonly string[]; readonly permissions: PermissionChange | null; readonly upgradeOn: UpgradeAuthority };

export type InstructionsReport =
  | ({ readonly state: "not checked"; readonly problem: null; readonly current: null; readonly template: number; readonly match: null } & Compared)
  | (InstructionsFinding & Compared);

export const proposedInstructionsPath = (home: string): string => join(home, "template", PROPOSED_INSTRUCTIONS_FILE);

export const checkInstructions = (file: string | null, home: string, catalogue: InstructionsCatalogue): InstructionsReport => {
  const proposed = proposedInstructionsPath(home);
  if (file === null) return { state: "not checked", problem: null, current: null, template: catalogue.version, match: null, proposed, diff: [], permissions: null, upgradeOn: "the owner's request" };
  const text = textOfFile(file, "The instructions file", HINT);
  const folded = foldWhitespace(text);
  const finding = classifyInstructions(folded, fingerprintOf(text), catalogue);
  const same = finding.state === "current" || finding.state === "newer";
  return { ...finding, proposed, diff: same ? [] : lineDiff(folded, foldWhitespace(catalogue.text)), permissions: permissionChange(finding, catalogue), upgradeOn: upgradeAuthority(finding, catalogue) };
};
