import { failure } from "./failure.ts";
import { isRecord } from "./json.ts";
import { matchOf, type Fingerprint, type TextMatch } from "./whitespace.ts";

export type EarlierPrompt = { readonly template: string; readonly whitespaceSha256: string; readonly variant: boolean };

export type RoutineMatch = TextMatch | "variant";

export type TemplateRoutine = Fingerprint & {
  readonly name: string;
  readonly schedule: string;
  readonly paused: boolean;
  readonly prompt: string;
  readonly variants: readonly string[];
  readonly earlier: readonly EarlierPrompt[];
};

export type BotRoutine = Fingerprint & { readonly name: string; readonly schedule: string };

export type RoutineOffer = { readonly name: string; readonly schedule: string; readonly prompt: string };

export type RoutineProblem = "routine-prompt-out-of-date" | "routine-missing" | "routine-custom";

type Proposal = { readonly name: string; readonly starts: "active" | "paused"; readonly schedule: { readonly current: string | null; readonly template: string }; readonly prompt: string };

export type RoutineFinding = Proposal &
  (
    | { readonly state: "current"; readonly problem: null; readonly match: RoutineMatch; readonly publishedIn: null }
    | { readonly state: "out-of-date"; readonly problem: "routine-prompt-out-of-date"; readonly match: "whitespace" | "variant"; readonly publishedIn: string }
    | { readonly state: "missing"; readonly problem: "routine-missing"; readonly match: null; readonly publishedIn: null }
    | { readonly state: "custom"; readonly problem: "routine-custom"; readonly match: null; readonly publishedIn: null }
  );

export const ROUTINES_HINT =
  'Write the bot\'s current routines to a JSON file outside the bot\'s private data directory and name that file with --routines. It holds a list of { "name", "schedule", "prompt" }, one entry for each routine this bot has now: its name, its schedule as the platform shows it, and its prompt copied exactly.';

const SHA256 = /^[0-9a-f]{64}$/;
const RANK: Readonly<Record<RoutineFinding["state"], number>> = { current: 0, "out-of-date": 1, custom: 2, missing: 3 };

const compare = (template: TemplateRoutine, proposal: Proposal, mine: BotRoutine): RoutineFinding => {
  const match = matchOf(mine, template);
  if (match !== null) return { ...proposal, state: "current", problem: null, match, publishedIn: null };
  if (template.variants.includes(mine.whitespaceSha256)) return { ...proposal, state: "current", problem: null, match: "variant", publishedIn: null };
  const earlier = template.earlier.find((entry) => entry.whitespaceSha256 === mine.whitespaceSha256);
  if (earlier !== undefined) {
    return { ...proposal, state: "out-of-date", problem: "routine-prompt-out-of-date", match: earlier.variant ? "variant" : "whitespace", publishedIn: earlier.template };
  }
  return { ...proposal, state: "custom", problem: "routine-custom", match: null, publishedIn: null };
};

export const classifyRoutine = (template: TemplateRoutine, mine: readonly BotRoutine[]): RoutineFinding => {
  const named = mine.filter((routine) => routine.name === template.name);
  const proposal = (current: string | null): Proposal => ({
    name: template.name,
    starts: template.paused ? "paused" : "active",
    schedule: { current, template: template.schedule },
    prompt: template.prompt,
  });
  const findings = named.map((routine) => compare(template, proposal(routine.schedule), routine)).sort((a, b) => RANK[a.state] - RANK[b.state]);
  return findings[0] ?? { ...proposal(null), state: "missing", problem: "routine-missing", match: null, publishedIn: null };
};

export const routineMessage = (finding: RoutineFinding, proposed: string): string | null => {
  const unchanged = "Nothing was changed: a routine's prompt is replaced only when the owner asks for it.";
  if (finding.state === "out-of-date") {
    return `routine-prompt-out-of-date: The routine ${finding.name} runs the prompt that template ${finding.publishedIn} published, and this template's prompt is different. This template's prompt is in ${proposed}. ${unchanged}`;
  }
  if (finding.state === "missing") {
    return `routine-missing: This bot has no routine named ${finding.name}. The template has one, on the schedule "${finding.schedule.template}", that starts ${finding.starts}. Its prompt is in ${proposed}. Nothing was created: adding the routine is the owner's choice.`;
  }
  if (finding.state === "custom") {
    return `routine-custom: The routine ${finding.name} runs a prompt that no template published, so someone wrote or changed it. This template's prompt is in ${proposed}. It was left as it is, so that nothing the owner wrote is lost. ${unchanged}`;
  }
  return null;
};

export const parseRoutineOffers = (value: unknown): readonly RoutineOffer[] => {
  if (!Array.isArray(value)) throw failure("E_INPUT_SCHEMA", "The routines file must hold a list of routines.", ROUTINES_HINT);
  return value.map((entry: unknown, index) => {
    const wrong = (field: string): never => {
      throw failure("E_INPUT_SCHEMA", `routines[${index}]${field === "" ? " must be an object" : `.${field} must be text`}.`, ROUTINES_HINT);
    };
    if (!isRecord(entry)) return wrong("");
    const { name, schedule, prompt } = entry;
    if (typeof name !== "string" || name === "") return wrong("name");
    if (typeof schedule !== "string") return wrong("schedule");
    if (typeof prompt !== "string") return wrong("prompt");
    return { name, schedule, prompt };
  });
};

export const parseTemplateRoutines = (value: unknown): readonly TemplateRoutine[] => {
  const wrong = (what: string): never => {
    throw new Error(`The embedded template routines ${what}.`);
  };
  const isHash = (candidate: unknown): candidate is string => typeof candidate === "string" && SHA256.test(candidate);
  if (!Array.isArray(value)) return wrong("must be a list");
  return value.map((entry: unknown): TemplateRoutine => {
    if (!isRecord(entry)) return wrong("must each be an object");
    const { name, schedule, paused, prompt, sha256, whitespaceSha256, variants, earlier } = entry;
    if (typeof name !== "string" || !/^ambitious-[a-z][a-z0-9-]*$/.test(name)) return wrong("need a name starting with ambitious-");
    if (typeof schedule !== "string" || typeof prompt !== "string" || prompt === "" || typeof paused !== "boolean") return wrong(`need a schedule, a prompt and whether ${name} starts paused`);
    if (!isHash(sha256) || !isHash(whitespaceSha256)) return wrong(`need the two SHA-256 values of the prompt of ${name}`);
    if (!Array.isArray(variants) || !variants.every(isHash)) return wrong(`need the SHA-256 of each variant of the prompt of ${name}`);
    if (!Array.isArray(earlier)) return wrong(`need the list of earlier prompts of ${name}`);
    const published = earlier.map((item: unknown): EarlierPrompt => {
      if (!isRecord(item) || typeof item.template !== "string" || !isHash(item.whitespaceSha256) || typeof item.variant !== "boolean") {
        return wrong(`list an earlier prompt of ${name} without its template version, its SHA-256 and whether it is a variant`);
      }
      return { template: item.template, whitespaceSha256: item.whitespaceSha256, variant: item.variant };
    });
    return { name, schedule, paused, prompt, sha256, whitespaceSha256, variants, earlier: published };
  });
};
