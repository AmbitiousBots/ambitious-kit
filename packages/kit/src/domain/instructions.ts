import { isRecord } from "./json.ts";
import { matchOf, type Fingerprint, type TextMatch } from "./whitespace.ts";

export type KnownInstructions = Fingerprint & { readonly version: number };

export type PublishedGrants = { readonly version: number; readonly grants: readonly string[]; readonly reasons: Readonly<Record<string, string>> };

export type InstructionsCatalogue = {
  readonly version: number;
  readonly oldestSupported: number;
  readonly text: string;
  readonly known: readonly KnownInstructions[];
  readonly grants: Readonly<Record<string, string>>;
  readonly versions: readonly PublishedGrants[];
};

export type InstructionsProblem = "instructions-out-of-date" | "instructions-custom";

export type InstructionsFinding =
  | { readonly state: "current"; readonly problem: null; readonly current: number; readonly template: number; readonly match: TextMatch }
  | { readonly state: "out-of-date"; readonly problem: "instructions-out-of-date"; readonly current: number; readonly template: number; readonly match: TextMatch }
  | { readonly state: "out-of-date"; readonly problem: "instructions-out-of-date"; readonly current: null; readonly template: number; readonly match: null }
  | { readonly state: "custom"; readonly problem: "instructions-custom"; readonly current: number | null; readonly template: number; readonly match: null }
  | { readonly state: "newer"; readonly problem: null; readonly current: number; readonly template: number; readonly match: null };

export type Permission = { readonly grant: string; readonly permission: string; readonly reason: string | null };

export type PermissionChange = {
  readonly comparedWith: "the bot's present text" | "the oldest supported text";
  readonly comparison: "more" | "fewer" | "same" | "more and fewer";
  readonly added: readonly Permission[];
  readonly removed: readonly Permission[];
  readonly statement: string;
};

export type UpgradeAuthority = "any request" | "the owner's request";

export type NewerTemplate = { readonly own: string; readonly latest: string };

export const UPGRADE_GRANT = "upgrade-on-any-request";

export const ADDITIONAL_PERMISSIONS = "Pasting this text gives the bot these additional permissions:";

const VERSION_LINE = /^Instructions version: ([1-9][0-9]*)(?:\n|$)/;
const SHA256 = /^[0-9a-f]{64}$/;

export const instructionsVersionOf = (folded: string): number | null => {
  const declared = VERSION_LINE.exec(folded)?.[1];
  return declared === undefined ? null : Number(declared);
};

export const classifyInstructions = (folded: string, given: Fingerprint, { version: template, known }: InstructionsCatalogue): InstructionsFinding => {
  if (folded === "") return { state: "out-of-date", problem: "instructions-out-of-date", current: null, template, match: null };
  const exact = known.find((entry) => entry.sha256 === given.sha256);
  const published = exact ?? known.find((entry) => matchOf(given, entry) !== null);
  if (published !== undefined) {
    const match: TextMatch = exact === undefined ? "whitespace" : "exact";
    return published.version === template
      ? { state: "current", problem: null, current: template, template, match }
      : { state: "out-of-date", problem: "instructions-out-of-date", current: published.version, template, match };
  }
  const declared = instructionsVersionOf(folded);
  if (declared !== null && declared > template) return { state: "newer", problem: null, current: declared, template, match: null };
  return { state: "custom", problem: "instructions-custom", current: declared, template, match: null };
};

export const needsOwner = (finding: InstructionsFinding): boolean =>
  finding.state === "out-of-date" || (finding.state === "custom" && finding.current !== finding.template);

export const upgradeAuthority = (finding: InstructionsFinding, { versions }: InstructionsCatalogue): UpgradeAuthority => {
  const published = finding.match === null ? undefined : versions.find((entry) => entry.version === finding.current);
  return published?.grants.includes(UPGRADE_GRANT) === true ? "any request" : "the owner's request";
};

const numbered = (permissions: readonly Permission[]): string => permissions.map(({ permission }, index) => `(${index + 1}) ${permission}`).join(" ");

const statementOf = (comparedWith: PermissionChange["comparedWith"], added: readonly Permission[], removed: readonly Permission[]): string => {
  const basis =
    comparedWith === "the bot's present text"
      ? ""
      : "This bot's present instructions are not a text this template published, so what they allow cannot be compared; the comparison is with the oldest instructions text still supported. ";
  const takesAway = removed.length === 0 ? "" : ` It takes away these permissions: ${numbered(removed)}`;
  if (added.length > 0) return `${basis}${ADDITIONAL_PERMISSIONS} ${numbered(added)}${takesAway}`;
  if (removed.length > 0) return `${basis}Pasting this text gives the bot no additional permissions.${takesAway}`;
  return `${basis}Pasting this text gives the bot no additional permissions and takes none away: it allows the same things as ${comparedWith}.`;
};

export const permissionChange = (finding: InstructionsFinding, { version, oldestSupported, grants, versions }: InstructionsCatalogue): PermissionChange | null => {
  if (finding.state === "newer") return null;
  const published = finding.match === null ? undefined : versions.find((entry) => entry.version === finding.current);
  const basis = published ?? versions.find((entry) => entry.version === oldestSupported);
  const proposed = versions.find((entry) => entry.version === version);
  if (basis === undefined || proposed === undefined) return null;
  const described = (names: readonly string[], reasons: Readonly<Record<string, string>>): readonly Permission[] =>
    names.map((grant) => ({ grant, permission: grants[grant] ?? grant, reason: reasons[grant] ?? null }));
  const added = described(proposed.grants.filter((grant) => !basis.grants.includes(grant)), proposed.reasons);
  const removed = described(basis.grants.filter((grant) => !proposed.grants.includes(grant)), {});
  const comparedWith = published === undefined ? "the oldest supported text" : "the bot's present text";
  const comparison = added.length > 0 ? (removed.length > 0 ? "more and fewer" : "more") : removed.length > 0 ? "fewer" : "same";
  return { comparedWith, comparison, added, removed, statement: statementOf(comparedWith, added, removed) };
};

export const instructionsMessage = (finding: InstructionsFinding, proposed: string, change: PermissionChange | null, newer: NewerTemplate | null): string | null => {
  const { current, template } = finding;
  const unchanged = "Nothing was changed: only the owner can replace a bot's instructions, and doing so is the owner's choice.";
  const permissions = change === null ? "" : ` ${change.statement}`;
  const behind =
    newer === null
      ? ""
      : ` A newer template, release ${newer.latest}, is available, and this installer is ${newer.own}. The newer template may carry a different instructions text, which may allow fewer things than this one. Update the template first, then check the instructions again and propose the text the newer template carries.`;
  if (finding.state === "out-of-date") {
    const have = current === null ? "have no text" : `are version ${current}`;
    return `instructions-out-of-date: This bot's instructions ${have} and this template's are version ${template}. The template's text is in ${proposed}.${behind} ${unchanged}${permissions}`;
  }
  if (finding.state === "custom") {
    if (current === template) {
      return `instructions-custom: This bot's instructions say version ${template}, the template's version, but their text is not the template's. They were left as they are.`;
    }
    const have = current === null ? "carry no version line" : `say version ${current}`;
    return `instructions-custom: This bot's instructions are not a text this template published; they ${have}, and this template's are version ${template}. The template's text is in ${proposed}.${behind} They were left as they are, so that nothing the owner wrote is lost. ${unchanged}${permissions}`;
  }
  if (finding.state === "newer") {
    return `This bot's instructions say version ${current}, which is newer than version ${template} that this installer knows. They were left as they are. Update the bot's skills to the template those instructions came from.`;
  }
  return null;
};

export const lineDiff = (from: string, to: string): readonly string[] => {
  const linesOf = (text: string): readonly string[] => (text === "" ? [] : text.replace(/\n$/, "").split("\n"));
  const [before, after] = [linesOf(from), linesOf(to)];
  const width = after.length + 1;
  const common = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      common[i * width + j] = before[i] === after[j] ? (common[(i + 1) * width + j + 1] ?? 0) + 1 : Math.max(common[(i + 1) * width + j] ?? 0, common[i * width + j + 1] ?? 0);
    }
  }
  const changes: string[] = [];
  let [i, j] = [0, 0];
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      i += 1;
      j += 1;
    } else if (j >= after.length || (i < before.length && (common[(i + 1) * width + j] ?? 0) >= (common[i * width + j + 1] ?? 0))) {
      changes.push(`- ${before[i] ?? ""}`);
      i += 1;
    } else {
      changes.push(`+ ${after[j] ?? ""}`);
      j += 1;
    }
  }
  return changes;
};

export const parseInstructionsCatalogue = (value: unknown): InstructionsCatalogue => {
  const wrong = (what: string): never => {
    throw new Error(`The embedded instructions catalogue ${what}.`);
  };
  const isVersion = (candidate: unknown, highest: number): candidate is number => typeof candidate === "number" && Number.isInteger(candidate) && candidate >= 1 && candidate <= highest;
  const isHash = (candidate: unknown): candidate is string => typeof candidate === "string" && SHA256.test(candidate);
  const isNames = (candidate: unknown): candidate is readonly string[] => Array.isArray(candidate) && candidate.every((name: unknown) => typeof name === "string");
  const texts = (candidate: unknown, what: string): Readonly<Record<string, string>> => {
    if (!isRecord(candidate)) return wrong(`needs ${what} as an object of name to text`);
    return Object.fromEntries(Object.entries(candidate).map(([name, text]) => [name, typeof text === "string" && text !== "" ? text : wrong(`needs text for "${name}" in ${what}`)]));
  };
  if (!isRecord(value)) return wrong("must be an object");
  const { version, oldestSupported, text, known, grants, versions } = value;
  if (!isVersion(version, Number.MAX_SAFE_INTEGER)) return wrong("needs a whole-number version of 1 or more");
  if (!isVersion(oldestSupported, version)) return wrong("needs an oldest supported version between 1 and the current one");
  if (typeof text !== "string" || text !== `${text.split("\n").map((line) => line.trimEnd()).join("\n").trim()}\n` || instructionsVersionOf(text) !== version) {
    return wrong(`needs its text to start with "Instructions version: ${version}" and to be free of trailing spaces and blank lines at either end`);
  }
  if (!Array.isArray(known)) return wrong("needs a list of known texts");
  const entries = known.map((entry: unknown): KnownInstructions => {
    if (!isRecord(entry) || !isVersion(entry.version, version)) return wrong("lists a known text without a version between 1 and the current one");
    if (!isHash(entry.sha256) || !isHash(entry.whitespaceSha256)) return wrong("lists a known text without its two SHA-256 values");
    return { version: entry.version, sha256: entry.sha256, whitespaceSha256: entry.whitespaceSha256 };
  });
  const described = texts(grants, "the grants");
  if (!Array.isArray(versions)) return wrong("needs a list of versions with their grants");
  const published = versions.map((entry: unknown): PublishedGrants => {
    if (!isRecord(entry) || !isVersion(entry.version, version)) return wrong("lists grants for a version that is not between 1 and the current one");
    if (!isNames(entry.grants) || entry.grants.some((grant) => described[grant] === undefined)) return wrong(`lists a grant for version ${entry.version} that it does not describe`);
    return { version: entry.version, grants: entry.grants, reasons: texts(entry.reasons, `the reasons of version ${entry.version}`) };
  });
  for (const needed of [version, oldestSupported]) if (!published.some((entry) => entry.version === needed)) return wrong(`needs the grants of version ${needed}`);
  return { version, oldestSupported, text, known: entries, grants: described, versions: published };
};
