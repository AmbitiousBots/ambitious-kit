import { failure } from "./failure.ts";
import { isRecord } from "./json.ts";

export const REVIEW_PAGE_EVERY_DAYS = 7;

const DAY_MS = 86_400_000;
const AGE: readonly (string | undefined)[] = ["less than a day", "1 day"];
const UTC_TIME = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z$/;

export type ReviewPageState = { readonly builtAt: string | null; readonly highPriority: readonly string[] };

export type ReviewPageDue = { readonly due: boolean; readonly daysSinceBuilt: number | null; readonly why: string };

export const NO_REVIEW_PAGE: ReviewPageState = { builtAt: null, highPriority: [] };

const HINT =
  'Name a JSON file outside the bot\'s private data directory with --in. It holds a list of text ids, one for each finding the audit module returned with priority "high", such as ["failing-routine"], or [] when there is none.';

export const parseReviewPageState = (value: unknown): ReviewPageState => {
  if (!isRecord(value)) return NO_REVIEW_PAGE;
  const { builtAt, highPriority } = value;
  return {
    builtAt: typeof builtAt === "string" && UTC_TIME.test(builtAt) && !Number.isNaN(Date.parse(builtAt)) ? builtAt : null,
    highPriority: Array.isArray(highPriority) ? highPriority.filter((id): id is string => typeof id === "string") : [],
  };
};

export const reviewPageDue = (builtAt: string | null, now: Date): ReviewPageDue => {
  if (builtAt === null) return { due: true, daysSinceBuilt: null, why: "No review Page has been recorded as built, so this run builds the first one." };
  const elapsed = now.getTime() - Date.parse(builtAt);
  const daysSinceBuilt = Math.floor(elapsed / DAY_MS);
  if (elapsed < 0) return { due: true, daysSinceBuilt, why: `The recorded build time ${builtAt} is in the future, so it is not trusted and this run builds the review Page.` };
  return elapsed >= REVIEW_PAGE_EVERY_DAYS * DAY_MS
    ? { due: true, daysSinceBuilt, why: `The review Page was last built ${daysSinceBuilt} days ago, at ${builtAt}. It is built when ${REVIEW_PAGE_EVERY_DAYS} or more days have passed.` }
    : { due: false, daysSinceBuilt, why: `The review Page was last built ${AGE[daysSinceBuilt] ?? `${daysSinceBuilt} days`} ago, at ${builtAt}. It is built again when ${REVIEW_PAGE_EVERY_DAYS} or more days have passed.` };
};

export const parseHighPriority = (value: unknown): readonly string[] => {
  if (!Array.isArray(value)) throw failure("E_INPUT_SCHEMA", "The input must be a list of finding ids.", HINT);
  return [
    ...new Set(
      value.map((id: unknown, index): string => {
        if (typeof id !== "string" || id === "") throw failure("E_INPUT_SCHEMA", `ids[${index}] must be a finding id as text.`, HINT);
        return id;
      }),
    ),
  ];
};

export const newHighPriority = (seen: readonly string[], current: readonly string[]): readonly string[] => current.filter((id) => !seen.includes(id));
