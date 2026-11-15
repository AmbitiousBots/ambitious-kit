import { isRecord } from "./json.ts";

export type KnownInstructions = { readonly version: number; readonly sha256: string };

export type InstructionsCatalogue = {
  readonly version: number;
  readonly text: string;
  readonly known: readonly KnownInstructions[];
};

export type InstructionsProblem = "instructions-out-of-date" | "instructions-custom";

export type InstructionsFinding =
  | { readonly state: "current"; readonly problem: null; readonly current: number; readonly template: number }
  | { readonly state: "out-of-date"; readonly problem: "instructions-out-of-date"; readonly current: number | null; readonly template: number }
  | { readonly state: "custom"; readonly problem: "instructions-custom"; readonly current: number | null; readonly template: number }
  | { readonly state: "newer"; readonly problem: null; readonly current: number; readonly template: number };

const VERSION_LINE = /^Instructions version: ([1-9][0-9]*)(?:\n|$)/;
const SHA256 = /^[0-9a-f]{64}$/;

export const normalizeInstructions = (text: string): string => {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trimEnd());
  const body = lines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
  return body === "" ? "" : `${body}\n`;
};

export const instructionsVersionOf = (normalized: string): number | null => {
  const declared = VERSION_LINE.exec(normalized)?.[1];
  return declared === undefined ? null : Number(declared);
};

export const classifyInstructions = (normalized: string, sha256: string, { version: template, known }: InstructionsCatalogue): InstructionsFinding => {
  if (normalized === "") return { state: "out-of-date", problem: "instructions-out-of-date", current: null, template };
  const published = known.find((entry) => entry.sha256 === sha256);
  if (published !== undefined) {
    return published.version === template
      ? { state: "current", problem: null, current: template, template }
      : { state: "out-of-date", problem: "instructions-out-of-date", current: published.version, template };
  }
  const declared = instructionsVersionOf(normalized);
  if (declared !== null && declared > template) return { state: "newer", problem: null, current: declared, template };
  return { state: "custom", problem: "instructions-custom", current: declared, template };
};

export const needsOwner = (finding: InstructionsFinding): boolean =>
  finding.state === "out-of-date" || (finding.state === "custom" && finding.current !== finding.template);

export const instructionsMessage = (finding: InstructionsFinding, proposed: string): string | null => {
  const { current, template } = finding;
  const unchanged = "Nothing was changed: only the owner can replace a bot's instructions, and doing so is the owner's choice.";
  if (finding.state === "out-of-date") {
    const have = current === null ? "have no text" : `are version ${current}`;
    return `instructions-out-of-date: This bot's instructions ${have} and this template's are version ${template}. The template's text is in ${proposed}. ${unchanged}`;
  }
  if (finding.state === "custom") {
    if (current === template) {
      return `instructions-custom: This bot's instructions say version ${template}, the template's version, but their text is not the template's. They were left as they are.`;
    }
    const have = current === null ? "carry no version line" : `say version ${current}`;
    return `instructions-custom: This bot's instructions are not a text this template published; they ${have}, and this template's are version ${template}. The template's text is in ${proposed}. They were left as they are, so that nothing the owner wrote is lost. ${unchanged}`;
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
  if (!isRecord(value)) return wrong("must be an object");
  const { version, text, known } = value;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) return wrong("needs a whole-number version of 1 or more");
  if (typeof text !== "string" || normalizeInstructions(text) !== text || instructionsVersionOf(text) !== version) {
    return wrong(`needs its text to start with "Instructions version: ${version}" and to be free of trailing spaces and blank lines at either end`);
  }
  if (!Array.isArray(known)) return wrong("needs a list of known texts");
  const entries = known.map((entry: unknown): KnownInstructions => {
    if (!isRecord(entry) || typeof entry.version !== "number" || !Number.isInteger(entry.version) || entry.version < 1 || entry.version > version) {
      return wrong("lists a known text without a version between 1 and the current one");
    }
    if (typeof entry.sha256 !== "string" || !SHA256.test(entry.sha256)) return wrong("lists a known text without a SHA-256");
    return { version: entry.version, sha256: entry.sha256 };
  });
  return { version, text, known: entries };
};
