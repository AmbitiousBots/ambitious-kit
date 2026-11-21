import { join } from "node:path";
import {
  blockMessage,
  instructionsAction,
  instructionsReason,
  overallAction,
  planRoutine,
  publishedTrust,
  routineReason,
  SELF_WRITE,
  updateStatement,
  type MergeOutcome,
  type PlanAction,
  type PlanTrust,
  type RoutinePlan,
} from "../domain/apply-plan.ts";
import { failure } from "../domain/failure.ts";
import { classifyInstructions, instructionsVersionOf, permissionChange, type InstructionsCatalogue, type InstructionsFinding, type PermissionChange } from "../domain/instructions.ts";
import type { LineChange, LineConflict } from "../domain/merge-lines.ts";
import { classifyRoutine, type TemplateRoutine } from "../domain/routines.ts";
import { foldWhitespace, matchOf, type Fingerprint, type TextMatch } from "../domain/whitespace.ts";
import { mergeInstructionTexts, type InstructionsMerge } from "./instructions-merge.ts";
import { proposedRoutinePath, routineOffersIn } from "./routines.ts";
import { templateDirectory } from "./template-files.ts";
import { fingerprintOf, textOfFile } from "./text-file.ts";

export type ApplyPlanRequest = {
  readonly home: string;
  readonly currentFile: string;
  readonly publishedFile: string;
  readonly publishedSha256: string;
  readonly routinesFile: string | null;
  readonly readBackFile: string | null;
};

type Planned = Fingerprint & { readonly source: "published" | "merged"; readonly text: string };

export type ApplyPlan = {
  readonly action: PlanAction;
  readonly reasons: readonly string[];
  readonly trust: PlanTrust;
  readonly write: typeof SELF_WRITE;
  readonly instructions: {
    readonly action: PlanAction;
    readonly current: Fingerprint & { readonly state: InstructionsFinding["state"]; readonly version: number | null; readonly match: TextMatch | null };
    readonly published: { readonly version: number | null; readonly sha256: string };
    readonly planned: Planned | null;
  };
  readonly permissions: (PermissionChange & { readonly statement: string }) | null;
  readonly merge: {
    readonly state: MergeOutcome;
    readonly base: InstructionsMerge["base"];
    readonly localChangesKept: readonly LineChange[];
    readonly conflicts: readonly LineConflict[];
  };
  readonly routines: { readonly state: "checked" | "not checked"; readonly routines: readonly (RoutinePlan & Fingerprint & { readonly proposed: string })[] };
  readonly previous: Fingerprint & { readonly version: number | null; readonly file: string; readonly keepAs: string; readonly archiveFirst: boolean };
  readonly readBack: (Fingerprint & { readonly file: string; readonly against: "the planned text" | "the present text"; readonly match: TextMatch | null }) | null;
};

const HINT =
  "Save the bot's current instructions and the published text from the check_updates result under AMBITIOUS_HOME, then pass --current, --published and --published-sha256, with --routines for the routine prompts and --read-back for the text read after a write.";

const NO_MERGE = { state: "not needed", base: null, localChangesKept: [], conflicts: [] } as const;

export const previousInstructionsPath = (home: string): string => join(templateDirectory(home), "previous-instructions.md");

export const applyPlan = ({ home, currentFile, publishedFile, publishedSha256, routinesFile, readBackFile }: ApplyPlanRequest, catalogue: InstructionsCatalogue, template: readonly TemplateRoutine[]): ApplyPlan => {
  if (!/^[0-9a-f]{64}$/.test(publishedSha256)) throw failure("E_USAGE", "The published SHA-256 must be 64 lower-case hexadecimal characters.", HINT);
  const current = textOfFile(currentFile, "The current instructions file", HINT);
  const published = textOfFile(publishedFile, "The published instructions file", HINT);
  const readBack = readBackFile === null ? null : textOfFile(readBackFile, "The read-back file", HINT);
  const offers = routinesFile === null ? null : routineOffersIn(routinesFile);
  const [currentPrint, publishedPrint] = [fingerprintOf(current), fingerprintOf(published)];
  const currentFinding = classifyInstructions(foldWhitespace(current), currentPrint, catalogue);
  const publishedFinding = classifyInstructions(foldWhitespace(published), publishedPrint, catalogue);
  const trust = publishedTrust(publishedPrint.sha256 === publishedSha256, publishedFinding, instructionsVersionOf(foldWhitespace(published)), currentFinding);
  const blocked = trust.blocked.length > 0;
  const merged = blocked || currentFinding.state !== "custom" ? null : mergeInstructionTexts(current, published, publishedSha256, catalogue);
  const keepsVersion = merged !== null && instructionsVersionOf(foldWhitespace(merged.merged)) === catalogue.version;
  const mergeState: MergeOutcome = merged === null ? "not needed" : merged.state === "merged" && !keepsVersion ? "conflicts" : merged.state;
  const mergedIsCurrent = merged !== null && matchOf(fingerprintOf(merged.merged), currentPrint) !== null;
  const instructions: PlanAction = blocked ? "blocked" : instructionsAction(currentFinding, mergeState, mergedIsCurrent);
  const useMerged = instructions === "apply" && merged !== null;
  const plannedText = instructions !== "apply" && instructions !== "apply-published-and-archive" ? null : useMerged ? merged.merged : published;
  const planned: Planned | null = plannedText === null ? null : { source: useMerged ? "merged" : "published", ...fingerprintOf(plannedText), text: plannedText };
  const routines = (offers === null || blocked ? [] : template).map((routine) => {
    const finding = classifyRoutine(routine, (offers ?? []).map(({ name, schedule, prompt }) => ({ name, schedule, ...fingerprintOf(prompt) })));
    return { ...planRoutine(finding, offers ?? []), sha256: routine.sha256, whitespaceSha256: routine.whitespaceSha256, proposed: proposedRoutinePath(home, routine.name) };
  });
  const change = planned === null ? null : permissionChange(currentFinding, catalogue);
  const kept = merged?.localChangesKept.length ?? 0;
  const against = planned?.text ?? current;
  return {
    action: overallAction([instructions, ...routines.map(({ action }) => action)]),
    reasons: blocked
      ? trust.blocked.map((reason) => blockMessage(reason, trust, currentFinding))
      : [instructionsReason(instructions, currentFinding, mergeState, merged?.base?.version ?? null, kept, merged?.conflicts.length ?? 0), ...routines.flatMap((routine) => routineReason(routine) ?? [])],
    trust,
    write: SELF_WRITE,
    instructions: {
      action: instructions,
      current: { state: currentFinding.state, version: currentFinding.current, match: currentFinding.match, ...currentPrint },
      published: { version: trust.publishedVersion, sha256: publishedPrint.sha256 },
      planned,
    },
    permissions: change === null ? null : { ...change, statement: updateStatement(change, currentFinding.state === "custom" && instructions !== "apply-published-and-archive") },
    merge: merged === null ? NO_MERGE : { state: mergeState, base: merged.base, localChangesKept: merged.localChangesKept, conflicts: merged.conflicts },
    routines: { state: offers === null ? "not checked" : "checked", routines },
    previous: { version: currentFinding.current, ...currentPrint, file: currentFile, keepAs: previousInstructionsPath(home), archiveFirst: instructions === "apply-published-and-archive" },
    readBack: readBack === null || readBackFile === null ? null : { file: readBackFile, ...fingerprintOf(readBack), against: planned === null ? "the present text" : "the planned text", match: matchOf(fingerprintOf(readBack), fingerprintOf(against)) },
  };
};
