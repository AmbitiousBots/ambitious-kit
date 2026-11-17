import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { join, parse, sep } from "node:path";
import { failure } from "../domain/failure.ts";
import { isRecord } from "../domain/json.ts";
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

const unsafeStatePath = (path: string): never => {
  throw failure("E_INSTALL_PATH", `The review Page state path ${path} is not a regular file under real directories.`, "Use an AMBITIOUS_HOME path with no symlinks and a regular template/review-page.json file. Check any symlink or non-regular target with the owner before removing it.");
};

const validateStatePath = (file: string): void => {
  const { root } = parse(file);
  let path = root;
  for (const part of file.slice(root.length).split(sep)) {
    path = join(path, part);
    const present = lstatSync(path, { throwIfNoEntry: false });
    if (present === undefined) break;
    if (path === file ? !present.isFile() : !present.isDirectory()) unsafeStatePath(path);
  }
};

const openState = (path: string): number | null => {
  try {
    validateStatePath(path);
    return openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch (error) {
    if (isRecord(error) && error.code === "ELOOP") unsafeStatePath(path);
    if (isRecord(error) && ["ENOENT", "EACCES", "EPERM"].includes(String(error.code))) return null;
    throw error;
  }
};

const stateIn = (path: string): ReviewPageState => {
  const descriptor = openState(path);
  if (descriptor === null) return NO_REVIEW_PAGE;
  try {
    if (!fstatSync(descriptor).isFile()) unsafeStatePath(path);
    try {
      return parseReviewPageState(JSON.parse(readFileSync(descriptor, "utf8")));
    } catch {
      return NO_REVIEW_PAGE;
    }
  } finally {
    closeSync(descriptor);
  }
};

export const reviewPage = ({ home, now, built, highPriority }: ReviewPageRequest): ReviewPageReport => {
  const file = refuseAgentData(reviewPageStatePath(home));
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
