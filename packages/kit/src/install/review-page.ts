import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newHighPriority, NO_REVIEW_PAGE, parseReviewPageState, REVIEW_PAGE_EVERY_DAYS, reviewPageDue, type ReviewPageDue, type ReviewPageState } from "../domain/review-page.ts";
import { refuseAgentData } from "../paths/refuse-agent-data.ts";
import { placeTemplateFiles, templateDirectory } from "./template-files.ts";

export type ReviewPageReport = ReviewPageDue & {
  readonly file: string;
  readonly everyDays: number;
  readonly builtAt: string | null;
  readonly recorded: boolean;
  readonly highPriority: readonly string[];
  readonly newHighPriority: readonly string[];
};

export type ReviewPageRequest = { readonly home: string; readonly now: Date; readonly built: boolean; readonly highPriority: readonly string[] | null };

const STATE_FILE = "review-page.json";

export const reviewPageStatePath = (home: string): string => join(templateDirectory(home), STATE_FILE);

const stateIn = (path: string): ReviewPageState => {
  try {
    return parseReviewPageState(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return NO_REVIEW_PAGE;
  }
};

export const reviewPage = ({ home, now, built, highPriority }: ReviewPageRequest): ReviewPageReport => {
  const file = reviewPageStatePath(refuseAgentData(home));
  const before = stateIn(file);
  const after: ReviewPageState = { builtAt: built ? now.toISOString() : before.builtAt, highPriority: highPriority ?? before.highPriority };
  if (built || highPriority !== null) placeTemplateFiles(home, new Map([[STATE_FILE, `${JSON.stringify(after, null, 2)}\n`]]));
  return {
    file,
    everyDays: REVIEW_PAGE_EVERY_DAYS,
    builtAt: after.builtAt,
    recorded: built,
    ...reviewPageDue(after.builtAt, now),
    highPriority: after.highPriority,
    newHighPriority: highPriority === null ? [] : newHighPriority(before.highPriority, highPriority),
  };
};
