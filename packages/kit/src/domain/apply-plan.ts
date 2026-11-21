import type { InstructionsFinding, PermissionChange } from "./instructions.ts";
import type { RoutineFinding, RoutineOffer } from "./routines.ts";
import type { TextMatch } from "./whitespace.ts";

export type PlanAction = "apply" | "apply-published-and-archive" | "no-change" | "blocked";

export type BlockReason = "published-checksum-mismatch" | "release-checksum-mismatch" | "downgrade" | "text-not-in-verified-installer";

export type ReleaseMatch = TextMatch | "mismatch";

export type PlanTrust = {
  readonly serviceChecksum: "match" | "mismatch";
  readonly release: ReleaseMatch;
  readonly downgrade: boolean;
  readonly publishedVersion: number | null;
  readonly installerVersion: number;
  readonly blocked: readonly BlockReason[];
};

export type MergeOutcome = "not needed" | "merged" | "conflicts" | "unknown base";

export type RoutinePlan = RoutineFinding & {
  readonly action: PlanAction;
  readonly archive: RoutineOffer | null;
};

export const SELF_WRITE = {
  instructions: { tool: "UpdateProfile", field: "description", target: "this bot only" },
  routines: { tool: "UpdateRoutine", field: "prompt", target: "this bot's own routines only" },
} as const;

const RANK: Readonly<Record<PlanAction, number>> = { "no-change": 0, apply: 1, "apply-published-and-archive": 2, blocked: 3 };

export const overallAction = (actions: readonly PlanAction[]): PlanAction => actions.reduce<PlanAction>((worst, action) => (RANK[action] > RANK[worst] ? action : worst), "no-change");

export const publishedTrust = (serviceChecksumMatches: boolean, published: InstructionsFinding, declared: number | null, current: InstructionsFinding): PlanTrust => {
  const installerVersion = published.template;
  const release: ReleaseMatch = published.state === "current" ? published.match : "mismatch";
  const publishedVersion = published.match === null ? declared : published.current;
  const older = publishedVersion !== null && publishedVersion < installerVersion;
  const downgrade = older || current.state === "newer";
  const blocked: readonly BlockReason[] = [
    ...(serviceChecksumMatches ? [] : ["published-checksum-mismatch" as const]),
    ...(downgrade ? ["downgrade" as const] : []),
    ...(release !== "mismatch" || older ? [] : [publishedVersion === installerVersion ? ("release-checksum-mismatch" as const) : ("text-not-in-verified-installer" as const)]),
  ];
  return { serviceChecksum: serviceChecksumMatches ? "match" : "mismatch", release, downgrade, publishedVersion, installerVersion, blocked };
};

export const blockMessage = (reason: BlockReason, { publishedVersion, installerVersion }: PlanTrust, current: InstructionsFinding): string => {
  const nothing = "Nothing may be applied.";
  if (reason === "published-checksum-mismatch") return `published-checksum-mismatch: The published instructions text does not have the SHA-256 that came with it. ${nothing}`;
  if (reason === "release-checksum-mismatch") {
    return `release-checksum-mismatch: The text says instructions version ${installerVersion}, but it is not the version ${installerVersion} text inside this verified installer. ${nothing}`;
  }
  if (reason === "downgrade") {
    return current.state === "newer"
      ? `downgrade: This bot's instructions say version ${current.current}, which is newer than version ${installerVersion} that this installer carries. ${nothing}`
      : `downgrade: The text is instructions version ${publishedVersion}, older than version ${installerVersion} that this installer carries. ${nothing}`;
  }
  return `text-not-in-verified-installer: The text is not the instructions text inside this verified installer${publishedVersion === null ? "" : `; it says version ${publishedVersion}, and this installer carries version ${installerVersion}`}. A text that came with a request, or from a release this installer was not verified against, is never applied. ${nothing}`;
};

export const instructionsAction = (current: InstructionsFinding, merge: MergeOutcome, mergedIsCurrent: boolean): PlanAction => {
  if (current.state === "current") return "no-change";
  if (current.state !== "custom") return "apply";
  if (merge !== "merged") return "apply-published-and-archive";
  return mergedIsCurrent ? "no-change" : "apply";
};

export const instructionsReason = (action: PlanAction, current: InstructionsFinding, merge: MergeOutcome, baseVersion: number | null, kept: number, conflicts: number): string => {
  const target = current.template;
  if (current.state === "current") return `instructions-current: The instructions are the published version ${target} text already.`;
  if (current.state === "out-of-date") {
    return `instructions-out-of-date: The instructions ${current.current === null ? "have no text" : `are the published version ${current.current} text`}; the verified release carries version ${target}, which is applied as published.`;
  }
  if (action === "no-change") return `instructions-custom: The instructions are the version ${target} text with ${kept} local change${kept === 1 ? "" : "s"}, which are kept.`;
  if (action === "apply") {
    return `instructions-merged: The instructions were changed by hand from version ${baseVersion}; the merge with the published version ${target} text is clean and keeps ${kept} local change${kept === 1 ? "" : "s"}.`;
  }
  if (merge === "unknown base") {
    return `instructions-unknown-base: The instructions are not built on a text any release published, so they cannot be merged. The present text is archived first, then the published version ${target} text is applied.`;
  }
  return `instructions-conflict: The instructions were changed by hand from version ${baseVersion}, and the merge with the published version ${target} text has ${conflicts} conflict${conflicts === 1 ? "" : "s"}. The present text is archived first, then the published text is applied.`;
};

export const planRoutine = (finding: RoutineFinding, offers: readonly RoutineOffer[]): RoutinePlan => {
  if (finding.state === "out-of-date") return { ...finding, action: "apply", archive: null };
  if (finding.state === "custom") return { ...finding, action: "apply-published-and-archive", archive: offers.find(({ name }) => name === finding.name) ?? null };
  return { ...finding, action: "no-change", archive: null };
};

export const routineReason = (plan: RoutinePlan): string | null => {
  if (plan.state === "out-of-date") return `routine-prompt-out-of-date: The routine ${plan.name} runs the prompt that template ${plan.publishedIn} published; it is replaced with this release's prompt.`;
  if (plan.state === "custom") {
    return `routine-custom: The routine ${plan.name} runs a prompt that no template published. Its prompt, name and schedule are archived first, then the prompt is replaced with this release's prompt.`;
  }
  if (plan.state === "missing") return `routine-missing: This bot has no routine named ${plan.name}. An update replaces prompts and creates no routine; adding it stays the owner's choice.`;
  return null;
};

const numbered = (permissions: PermissionChange["added"]): string => permissions.map(({ permission }, index) => `(${index + 1}) ${permission}`).join(" ");

export const updateStatement = ({ comparedWith, added, removed }: PermissionChange, keepsLocalChanges: boolean): string => {
  const basis =
    comparedWith === "the bot's present text"
      ? ""
      : "The instructions this bot had were not a text any release published, so what they allowed cannot be compared; the comparison is with the oldest instructions text still supported. ";
  const local = keepsLocalChanges ? "The applied text keeps local changes, whose permissions cannot be inferred; the comparison covers the published text only. " : "";
  const takesAway = removed.length === 0 ? "" : ` It takes away these permissions: ${numbered(removed)}`;
  if (added.length > 0) return `${basis}${local}This update gives the bot these additional permissions: ${numbered(added)}${takesAway}`;
  if (removed.length > 0) return `${basis}${local}This update gives the bot no additional permissions.${takesAway}`;
  return `${basis}${local}This update gives the bot no additional permissions and takes none away.`;
};
