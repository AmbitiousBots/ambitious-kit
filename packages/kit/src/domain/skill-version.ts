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

const VERSION_LINE = /^Template version: ((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?:\r?\n|$)/;
const SKILL_NAME = /^ambitious-[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

const HINT =
  'Give a list of { "name", "stored", "candidate" }: the skill name starting with ambitious-, the body now stored in the skill library (null when there is none), and the body this template would write, whose first line is "Template version: x.y.z".';

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

export const parseSkillOffers = (value: unknown): readonly SkillOffer[] => {
  if (!Array.isArray(value)) throw failure("E_INPUT_SCHEMA", "The input must be a list of skills.", HINT);
  return value.map((entry: unknown, index) => {
    const wrong = (field: string, rule: string): never => {
      throw failure("E_INPUT_SCHEMA", `skills[${index}].${field} ${rule}.`, HINT);
    };
    if (!isRecord(entry)) return wrong("", "must be an object");
    const { name, stored, candidate } = entry;
    if (typeof name !== "string" || !SKILL_NAME.test(name)) return wrong("name", "must be a skill name starting with ambitious-");
    if (stored !== null && typeof stored !== "string") return wrong("stored", "must be the stored body as text, or null when no such skill is stored");
    if (typeof candidate !== "string") return wrong("candidate", "must be the body this template would write, as text");
    return { name, stored, candidate };
  });
};
