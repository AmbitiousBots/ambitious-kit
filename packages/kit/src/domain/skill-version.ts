import { failure } from "./failure.ts";
import { isRecord } from "./json.ts";
import { isNewerVersion } from "./lock.ts";

export type SkillAction = "create" | "unchanged" | "update" | "keep";

export type SkillDecision = {
  readonly name: string;
  readonly action: SkillAction;
  readonly storedVersion: string | null;
  readonly candidateVersion: string;
  readonly tellOwner: string | null;
};

export type SkillOffer = { readonly name: string; readonly stored: string | null; readonly candidate: string };

export type SkillRequest = { readonly name: string; readonly stored: string | null; readonly candidate: string | null };

const VERSION_LINE = /^Template version: ((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?:\r?\n|$)/;
const SKILL_NAME = /^ambitious-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const HINT =
  'Give a list of { "name", "stored" }: the skill name starting with ambitious-, and the body now stored in the skill library (null when there is none). The body to compare it with is the one inside this installer. For a skill this installer does not carry, add "candidate": the body that would be written, whose first line is "Template version: x.y.z".';

export const templateVersionOf = (body: string): string | null => VERSION_LINE.exec(body)?.[1] ?? null;

export const decideSkillWrite = ({ name, stored, candidate }: SkillOffer): SkillDecision => {
  const candidateVersion = templateVersionOf(candidate);
  if (candidateVersion === null) throw failure("E_INPUT_SCHEMA", `The candidate body of ${name} does not start with a "Template version: x.y.z" line.`, HINT);
  const storedVersion = stored === null ? null : templateVersionOf(stored);
  const decision = (action: SkillAction, tellOwner: string | null = null): SkillDecision => ({ name, action, storedVersion, candidateVersion, tellOwner });
  if (stored === null) return decision("create");
  if (stored === candidate) return decision("unchanged");
  if (storedVersion === null || isNewerVersion(candidateVersion, storedVersion)) return decision("update");
  if (isNewerVersion(storedVersion, candidateVersion)) {
    return decision(
      "keep",
      `The shared skill ${name} belongs to template version ${storedVersion}, which is newer than this bot's template version ${candidateVersion}. It was left as it is. Update this bot's template to ${storedVersion} so its instructions match the shared skills.`,
    );
  }
  return decision(
    "keep",
    `The shared skill ${name} is marked template version ${storedVersion} but its text differs from this bot's copy of that version. It was left as it is. If the change was not intended, restore the skill from template ${storedVersion}.`,
  );
};

export const skillChange = ({ name, action, storedVersion, candidateVersion }: SkillDecision): string | null => {
  if (action === "create") return `${name}: new, template ${candidateVersion}`;
  if (action === "update") return `${name}: template ${storedVersion ?? "without a version line"} -> ${candidateVersion}`;
  return null;
};

export const withTemplateBodies = (requests: readonly SkillRequest[], bodies: ReadonlyMap<string, string>): readonly SkillOffer[] =>
  requests.map(({ name, stored, candidate }, index) => {
    const own = bodies.get(name);
    if (own !== undefined && candidate !== null && candidate !== own) {
      throw failure(
        "E_INPUT_SCHEMA",
        `skills[${index}].candidate is not the body this installer carries for ${name}, so it was not compared.`,
        "Leave candidate out. The installer compares the stored body with its own, which the pin on the installer covers; a body from anywhere else is never written.",
      );
    }
    const body = own ?? candidate;
    if (body === null) {
      throw failure("E_INPUT_SCHEMA", `skills[${index}].candidate was left out, and ${name} is not a skill this installer carries.`, HINT);
    }
    return { name, stored, candidate: body };
  });

export const parseSkillOffers = (value: unknown): readonly SkillRequest[] => {
  if (!Array.isArray(value)) throw failure("E_INPUT_SCHEMA", "The input must be a list of skills.", HINT);
  return value.map((entry: unknown, index) => {
    const wrong = (field: string, rule: string): never => {
      throw failure("E_INPUT_SCHEMA", `skills[${index}].${field} ${rule}.`, HINT);
    };
    if (!isRecord(entry)) return wrong("", "must be an object");
    const { name, stored, candidate } = entry;
    if (typeof name !== "string" || !SKILL_NAME.test(name)) return wrong("name", "must be a skill name starting with ambitious-");
    if (stored !== null && typeof stored !== "string") return wrong("stored", "must be the stored body as text, or null when no such skill is stored");
    if (candidate !== undefined && candidate !== null && typeof candidate !== "string") return wrong("candidate", "must be the body that would be written, as text, or be left out to use the body inside this installer");
    return { name, stored, candidate: candidate ?? null };
  });
};
