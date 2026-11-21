import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  blockMessage,
  damagedReason,
  heldReason,
  instructionsAction,
  instructionsReason,
  notGrantedReason,
  overallAction,
  planRoutine,
  publishedTrust,
  restoredReason,
  retryAllowed,
  routineReason,
  SELF_WRITE,
  truncatedFrom,
  updateStatement,
  type FailedApply,
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
    readonly damagedFrom: number | null;
    readonly failedApply: FailedApply | null;
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
  'template/update-state.json under AMBITIOUS_HOME must hold a JSON object. After the owner restored the earlier instructions it carries "restoredOver": { "version": <the published version that was replaced>, "sha256": "<the SHA-256 of that published text>" }; remove that entry when the owner asks for the published text again. After a failed apply it carries "failedApply": { "version": <the published version that was being applied>, "sha256": "<the SHA-256 of that published text>", "kind": "refused" or what else failed, "attempts": <how many times it failed> }, with "routine": { "name", "sha256" } when a routine write failed.';

type UpdateState = { readonly restoredOver: RestoredOver | null; readonly failedApply: FailedApply | null };

const isSha256 = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

const updateStateIn = (home: string): UpdateState => {
  const file = updateStatePath(home);
  if (!existsSync(file)) return { restoredOver: null, failedApply: null };
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
  const restoredOf = (value: unknown): RestoredOver | null => {
    if (value === undefined || value === null) return null;
    if (!isRecord(value) || !isSha256(value.sha256)) return wrong("names a restore without the SHA-256 of the published text it replaced");
    return { version: typeof value.version === "number" ? value.version : null, sha256: value.sha256 };
  };
  const routineOf = (value: unknown): FailedApply["routine"] => {
    if (value === undefined || value === null) return null;
    if (!isRecord(value) || typeof value.name !== "string" || !isSha256(value.sha256)) return wrong("names a failed routine write without the routine's name and the SHA-256 of the published prompt");
    return { name: value.name, sha256: value.sha256 };
  };
  const failedOf = (value: unknown): FailedApply | null => {
    if (value === undefined || value === null) return null;
    if (!isRecord(value) || !isSha256(value.sha256)) return wrong("names a failed apply without the SHA-256 of the published text that was being applied");
    return { version: typeof value.version === "number" ? value.version : null, sha256: value.sha256, kind: typeof value.kind === "string" ? value.kind : null, attempts: typeof value.attempts === "number" ? value.attempts : null, routine: routineOf(value.routine) };
  };
  return { restoredOver: restoredOf(state.restoredOver), failedApply: failedOf(state.failedApply) };
};

const plannedRoutines = (home: string, template: readonly TemplateRoutine[], offers: readonly RoutineOffer[], failed: FailedApply | null): readonly PlannedRoutine[] =>
  template.flatMap((routine) => {
    const named = offers.filter(({ name }) => name === routine.name);
    const entry = (mine: RoutineOffer | null): PlannedRoutine => {
      const finding = classifyRoutine(routine, mine === null ? [] : [{ name: mine.name, schedule: mine.schedule, ...fingerprintOf(mine.prompt) }]);
      const held = failed?.routine?.name === routine.name && failed.routine.sha256 === routine.sha256;
      return { ...planRoutine(finding, mine, named.length, held), sha256: routine.sha256, whitespaceSha256: routine.whitespaceSha256, proposed: proposedRoutinePath(home, routine.name), presentSha256: mine === null ? null : fingerprintOf(mine.prompt).sha256 };
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
  const publishedTexts = [...catalogue.versions.flatMap(({ version, text }) => (text === undefined ? [] : [{ version, folded: foldWhitespace(text) }])), { version: catalogue.version, folded: foldWhitespace(catalogue.text) }];
  const truncated = blocked ? null : truncatedFrom(currentFinding, foldWhitespace(current), publishedTexts);
  const damaged = truncated !== null;
  const merged = blocked || damaged || currentFinding.state !== "custom" ? null : mergeInstructionTexts(current, published, publishedSha256, catalogue);
  const keepsVersion = merged !== null && instructionsVersionOf(foldWhitespace(merged.merged)) === catalogue.version;
  const mergeState: MergeOutcome = merged === null ? "not needed" : merged.state === "merged" && !keepsVersion ? "conflicts" : merged.state;
  const mergedIsCurrent = merged !== null && matchOf(fingerprintOf(merged.merged), currentPrint) !== null;
  const wanted: PlanAction = blocked ? "blocked" : instructionsAction(currentFinding, mergeState, mergedIsCurrent, damaged);
  const writes = wanted === "apply" || wanted === "apply-published-and-archive";
  const state = updateStateIn(home);
  const failed = state.failedApply === null || retryAllowed(state.failedApply) ? null : state.failedApply;
  const restoredOver = writes && !damaged && state.restoredOver?.sha256 === publishedPrint.sha256 ? state.restoredOver : null;
  const failedApply = writes && restoredOver === null && failed?.sha256 === publishedPrint.sha256 ? failed : null;
  const instructions: PlanAction = restoredOver === null && failedApply === null ? wanted : "no-change";
  const useMerged = instructions === "apply" && merged !== null;
  const plannedText = !writes || instructions === "no-change" ? null : useMerged ? merged.merged : published;
  const planned: Planned | null = plannedText === null ? null : { source: useMerged ? "merged" : "published", ...fingerprintOf(plannedText), text: plannedText };
  const routines = offers === null || blocked ? [] : plannedRoutines(home, template, offers, failed);
  const change = planned === null ? null : permissionChange(currentFinding, catalogue);
  const kept = merged?.localChangesKept.length ?? 0;
  const against = planned?.text ?? current;
  const action = overallAction([instructions, ...routines.map((routine) => routine.action)]);
  const selfApply = selfApplyAuthority(currentFinding, foldWhitespace(current), catalogue);
  const repairs = selfApply === "granted" && failedApply === null;
  const why =
    restoredOver !== null
      ? [restoredReason(restoredOver, catalogue.version)]
      : [
          ...(failedApply === null ? [] : [heldReason(failedApply, catalogue.version)]),
          ...(truncated === null ? [] : [damagedReason(truncated, catalogue.version, repairs)]),
          ...(failedApply === null && truncated === null ? [instructionsReason(instructions, currentFinding, mergeState, merged?.base?.version ?? null, kept, merged?.conflicts.length ?? 0)] : []),
        ];
  const notGranted = selfApply === "granted" || action === "no-change" || damaged ? [] : [notGrantedReason(catalogue.version)];
  return {
    action,
    selfApply,
    reasons: blocked
      ? trust.blocked.map((reason) => blockMessage(reason, trust, currentFinding))
      : [...notGranted, ...why, ...routines.flatMap((routine) => routineReason(routine) ?? [])],
    trust,
    write: SELF_WRITE,
    instructions: {
      action: instructions,
      current: { state: currentFinding.state, version: currentFinding.current, match: currentFinding.match, ...currentPrint },
      published: { version: trust.publishedVersion, sha256: publishedPrint.sha256 },
      planned,
      restoredOver,
      damagedFrom: truncated?.version ?? null,
      failedApply,
    },
    permissions: change === null ? null : { ...change, statement: updateStatement(change, useMerged) },
    merge: merged === null ? NO_MERGE : { state: mergeState, base: merged.base, localChangesKept: merged.localChangesKept, conflicts: merged.conflicts },
    routines: { state: offers === null ? "not checked" : "checked", routines },
    previous: { version: currentFinding.current, ...currentPrint, file: currentFile, keepAs: previousInstructionsPath(home), archiveFirst: instructions === "apply-published-and-archive" },
    readBack: readBack === null || readBackFile === null ? null : { file: readBackFile, ...fingerprintOf(readBack), against: planned === null ? "the present text" : "the planned text", match: matchOf(fingerprintOf(readBack), fingerprintOf(against)), previousMatch: matchOf(fingerprintOf(readBack), currentPrint) },
  };
};
