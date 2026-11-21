import { failure } from "../domain/failure.ts";
import { classifyInstructions, instructionsVersionOf, permissionChange, type InstructionsCatalogue, type PermissionChange } from "../domain/instructions.ts";
import { mergeLines, unknownBaseMerge, type LineMerge } from "../domain/merge-lines.ts";
import { foldWhitespace, type TextMatch } from "../domain/whitespace.ts";
import { fingerprintOf, sha256Of, textOfFile } from "./text-file.ts";

export type InstructionsMerge = LineMerge & {
  readonly state: "merged" | "conflicts" | "unknown base";
  readonly base: { readonly version: number; readonly match: TextMatch | "version line" } | null;
  readonly published: { readonly version: number | null; readonly sha256: string };
  readonly permissions: PermissionChange | null;
  readonly permissionsStatement: string;
};

const HINT = "Save the bot's current and the published instructions under AMBITIOUS_HOME, then pass --current, --published and --published-sha256. The merge itself changes nothing.";

export const mergeInstructions = (currentFile: string, publishedFile: string, publishedSha256: string, catalogue: InstructionsCatalogue): InstructionsMerge => {
  if (!/^[0-9a-f]{64}$/.test(publishedSha256)) throw failure("E_USAGE", "The published SHA-256 must be 64 lower-case hexadecimal characters.", HINT);
  const current = textOfFile(currentFile, "The current instructions file", HINT);
  const published = textOfFile(publishedFile, "The published instructions file", HINT);
  if (sha256Of(published) !== publishedSha256) throw failure("E_INSTALL_CHECKSUM", "The published instructions do not match the supplied SHA-256. Nothing was merged or changed.", "Use the exact instructions text and SHA-256 from the confirmed Ambitious connection's check_updates result.");
  return mergeInstructionTexts(current, published, publishedSha256, catalogue);
};

export const mergeInstructionTexts = (current: string, published: string, publishedSha256: string, catalogue: InstructionsCatalogue): InstructionsMerge => {
  const currentFinding = classifyInstructions(foldWhitespace(current), fingerprintOf(current), catalogue);
  const targetFinding = classifyInstructions(foldWhitespace(published), fingerprintOf(published), catalogue);
  const baseVersion = currentFinding.match === null ? instructionsVersionOf(foldWhitespace(current)) : currentFinding.current;
  const baseEntry = catalogue.versions.find(({ version }) => version === baseVersion);
  const baseText = baseEntry?.text ?? (baseVersion === catalogue.version ? catalogue.text : undefined);
  const base = baseText === undefined || baseVersion === null ? null : { version: baseVersion, match: currentFinding.match ?? "version line" as const };
  const result = baseText === undefined ? unknownBaseMerge(current, published) : mergeLines(baseText, currentFinding.match === "whitespace" ? baseText : current, published);
  const mergedFinding = classifyInstructions(foldWhitespace(result.merged), fingerprintOf(result.merged), catalogue);
  const targetVersion = mergedFinding.match !== null ? mergedFinding.current : targetFinding.match !== null ? targetFinding.current : null;
  const permissions = targetVersion === null ? null : permissionChange(currentFinding, { ...catalogue, version: targetVersion });
  const limitation = mergedFinding.match === null ? "The merged text is customised or has conflicts; its permissions cannot be inferred. The following comparison covers only the published text, and every local change and conflict needs a reader before the merged text is used. " : "";
  const permissionsStatement = `${limitation}${permissions?.statement ?? "This installer does not know the published text's permissions; review both texts with the owner. No permission is inferred from a version line."}`;
  return {
    ...result,
    state: base === null ? "unknown base" : result.conflicts.length > 0 ? "conflicts" : "merged",
    base,
    published: { version: targetFinding.match === null ? instructionsVersionOf(foldWhitespace(published)) : targetFinding.current, sha256: publishedSha256 },
    permissions,
    permissionsStatement,
  };
};
