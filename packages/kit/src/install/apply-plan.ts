import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  blockMessage,
  instructionsAction,
  instructionsReason,
  isDamaged,
  notGrantedReason,
  overallAction,
  planRoutine,
  publishedTrust,
  restoredReason,
  routineReason,
  SELF_WRITE,
  updateStatement,
  type MergeOutcome,
  type PlanAction,
  type PlanTrust,
  type RestoredOver,
  type RoutinePlan,
} from "../domain/apply-plan.ts";
import { failure } from "../domain/failure.ts";
import { classifyInstructions, instructionsVersionOf, permissionChange, selfApplyAuthority, type InstructionsCatalogue, type InstructionsFinding, type PermissionChange, type SelfApply } from "../domain/instructions.ts";
import { isRecord } from "../domain/json.ts";
import type { LineChange, LineConflict } from "../domain/merge-lines.ts";
import { classifyRoutine, type RoutineOffer, type TemplateRoutine } from "../domain/routines.ts";
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

type PlannedRoutine = RoutinePlan & Fingerprint & { readonly proposed: string; readonly presentSha256: string | null };

export type ApplyPlan = {
  readonly action: PlanAction;
  readonly selfApply: SelfApply;
  readonly reasons: readonly string[];
  readonly trust: PlanTrust;
  readonly write: typeof SELF_WRITE;
  readonly instructions: {
    readonly action: PlanAction;
    readonly current: Fingerprint & { readonly state: InstructionsFinding["state"]; readonly version: number | null; readonly match: TextMatch | null };
    readonly published: { readonly version: number | null; readonly sha256: string };
    readonly planned: Planned | null;
    readonly restoredOver: RestoredOver | null;
  };
  readonly permissions: (PermissionChange & { readonly statement: string }) | null;
  readonly merge: {
    readonly state: MergeOutcome;
    readonly base: InstructionsMerge["base"];
    readonly localChangesKept: readonly LineChange[];
    readonly conflicts: readonly LineConflict[];
  };
  readonly routines: { readonly state: "checked" | "not checked"; readonly routines: readonly PlannedRoutine[] };
  readonly previous: Fingerprint & { readonly version: number | null; readonly file: string; readonly keepAs: string; readonly archiveFirst: boolean };
  readonly readBack: (Fingerprint & { readonly file: string; readonly against: "the planned text" | "the present text"; readonly match: TextMatch | null; readonly previousMatch: TextMatch | null }) | null;
};

const HINT =
  "Save the bot's current instructions and the published text from the check_updates result under AMBITIOUS_HOME, then pass --current, --published and --published-sha256, with --routines for the routine prompts and --read-back for the text read after a write.";

const NO_MERGE = { state: "not needed", base: null, localChangesKept: [], conflicts: [] } as const;

export const previousInstructionsPath = (home: string): string => join(templateDirectory(home), "previous-instructions.md");

export const updateStatePath = (home: string): string => join(templateDirectory(home), "update-state.json");

const STATE_HINT =
  'template/update-state.json under AMBITIOUS_HOME must hold a JSON object. After the owner restored the earlier instructions it carries "restoredOver": { "version": <the published version that was replaced>, "sha256": "<the SHA-256 of that published text>" }; remove that entry when the owner asks for the published text again.';

const restoredOverIn = (home: string): RestoredOver | null => {
  const file = updateStatePath(home);
  if (!existsSync(file)) return null;
  const wrong = (what: string): never => {
    throw failure("E_INPUT_SCHEMA", `The update state file ${file} ${what}. Nothing was planned.`, STATE_HINT);
  };
  const text = textOfFile(file, "The update state file", STATE_HINT);
  let state: unknown;
  try {
    state = JSON.parse(text);
  } catch {
    return wrong("could not be read as JSON");
  }
  if (!isRecord(state)) return wrong("must hold an object");
  const { restoredOver } = state;
  if (restoredOver === undefined || restoredOver === null) return null;
  if (!isRecord(restoredOver) || typeof restoredOver.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(restoredOver.sha256)) return wrong("names a restore without the SHA-256 of the published text it replaced");
  return { version: typeof restoredOver.version === "number" ? restoredOver.version : null, sha256: restoredOver.sha256 };
};

const plannedRoutines = (home: string, template: readonly TemplateRoutine[], offers: readonly RoutineOffer[]): readonly PlannedRoutine[] =>
  template.flatMap((routine) => {
    const named = offers.filter(({ name }) => name === routine.name);
    const entry = (mine: RoutineOffer | null): PlannedRoutine => {
      const finding = classifyRoutine(routine, mine === null ? [] : [{ name: mine.name, schedule: mine.schedule, ...fingerprintOf(mine.prompt) }]);
      return { ...planRoutine(finding, mine, named.length), sha256: routine.sha256, whitespaceSha256: routine.whitespaceSha256, proposed: proposedRoutinePath(home, routine.name), presentSha256: mine === null ? null : fingerprintOf(mine.prompt).sha256 };
    };
    return named.length === 0 ? [entry(null)] : named.map(entry);
  });

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
  const damaged = merged !== null && isDamaged(currentFinding, mergeState, merged.localChangesKept);
  const wanted: PlanAction = blocked ? "blocked" : instructionsAction(currentFinding, mergeState, mergedIsCurrent, damaged);
  const writes = wanted === "apply" || wanted === "apply-published-and-archive";
  const state = restoredOverIn(home);
  const restoredOver = writes && state?.sha256 === publishedPrint.sha256 ? state : null;
  const instructions: PlanAction = restoredOver === null ? wanted : "no-change";
  const useMerged = instructions === "apply" && merged !== null && !damaged;
  const plannedText = !writes || restoredOver !== null ? null : useMerged ? merged.merged : published;
  const planned: Planned | null = plannedText === null ? null : { source: useMerged ? "merged" : "published", ...fingerprintOf(plannedText), text: plannedText };
  const routines = offers === null || blocked ? [] : plannedRoutines(home, template, offers);
  const change = planned === null ? null : permissionChange(currentFinding, catalogue);
  const kept = merged?.localChangesKept.length ?? 0;
  const against = planned?.text ?? current;
  const action = overallAction([instructions, ...routines.map((routine) => routine.action)]);
  const selfApply = selfApplyAuthority(currentFinding, foldWhitespace(current), catalogue);
  const why = restoredOver === null ? instructionsReason(instructions, currentFinding, mergeState, merged?.base?.version ?? null, kept, merged?.conflicts.length ?? 0, damaged) : restoredReason(restoredOver, catalogue.version);
  return {
    action,
    selfApply,
    reasons: blocked
      ? trust.blocked.map((reason) => blockMessage(reason, trust, currentFinding))
      : [...(selfApply === "granted" || action === "no-change" ? [] : [notGrantedReason(catalogue.version)]), why, ...routines.flatMap((routine) => routineReason(routine) ?? [])],
    trust,
    write: SELF_WRITE,
    instructions: {
      action: instructions,
      current: { state: currentFinding.state, version: currentFinding.current, match: currentFinding.match, ...currentPrint },
      published: { version: trust.publishedVersion, sha256: publishedPrint.sha256 },
      planned,
      restoredOver,
    },
    permissions: change === null ? null : { ...change, statement: updateStatement(change, useMerged) },
    merge: merged === null ? NO_MERGE : { state: mergeState, base: merged.base, localChangesKept: merged.localChangesKept, conflicts: merged.conflicts },
    routines: { state: offers === null ? "not checked" : "checked", routines },
    previous: { version: currentFinding.current, ...currentPrint, file: currentFile, keepAs: previousInstructionsPath(home), archiveFirst: instructions === "apply-published-and-archive" },
    readBack: readBack === null || readBackFile === null ? null : { file: readBackFile, ...fingerprintOf(readBack), against: planned === null ? "the present text" : "the planned text", match: matchOf(fingerprintOf(readBack), fingerprintOf(against)), previousMatch: matchOf(fingerprintOf(readBack), currentPrint) },
  };
};
