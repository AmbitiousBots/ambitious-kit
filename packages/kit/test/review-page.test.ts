import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Failure } from "../src/domain/failure.ts";
import { guideFor, parseGuides } from "../src/domain/guides.ts";
import { newHighPriority, NO_REVIEW_PAGE, parseHighPriority, parseReviewPageState, REVIEW_PAGE_EVERY_DAYS, reviewPageDue } from "../src/domain/review-page.ts";
import { placeGuideFile } from "../src/install/guide-files.ts";
import { reviewPage, reviewPageStatePath } from "../src/install/review-page.ts";

const NOW = new Date("2026-03-09T16:00:00.000Z");
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const ago = (milliseconds: number): string => new Date(NOW.getTime() - milliseconds).toISOString();

const scratch = (t: TestContext): string => {
  const home = mkdtempSync(join(tmpdir(), "ambitious-review-page-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
};

const codeOf = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (error instanceof Failure) return error.errors[0].code;
    throw error;
  }
  return "";
};

test("the weekly review Page is due when none was built and when the last one was built 7 or more days ago, to the nearest day", () => {
  assert.equal(REVIEW_PAGE_EVERY_DAYS, 7);
  assert.deepEqual(reviewPageDue(null, NOW), { due: true, daysSinceBuilt: null, why: "No review Page has been recorded as built, so this run builds the first one." });
  const cases: readonly (readonly [number, boolean, number])[] = [
    [0, false, 0],
    [DAY, false, 1],
    [6 * DAY, false, 6],
    [6 * DAY + 11 * 60 * MINUTE, false, 6],
    [7 * DAY - 5 * MINUTE, true, 7],
    [7 * DAY, true, 7],
    [7 * DAY + 5 * MINUTE, true, 7],
    [8 * DAY, true, 8],
    [40 * DAY, true, 40],
  ];
  for (const [age, due, days] of cases) {
    const answer = reviewPageDue(ago(age), NOW);
    assert.deepEqual([answer.due, answer.daysSinceBuilt], [due, days], `built ${age / DAY} days ago`);
  }
  const daily = [1, 2, 3, 4, 5, 6, 7].map((day) => reviewPageDue(ago(day * DAY - 3 * MINUTE), NOW).due);
  assert.deepEqual(daily, [false, false, false, false, false, false, true], "a routine that starts a few minutes early each day builds the Page on the seventh day, not the eighth");
  assert.match(reviewPageDue(ago(DAY), NOW).why, /^The review Page was last built 1 day ago, at .* It is built again when 7 or more days have passed\.$/);
  assert.match(reviewPageDue(ago(0), NOW).why, /^The review Page was last built less than a day ago, /);
  assert.match(reviewPageDue(ago(9 * DAY), NOW).why, /^The review Page was last built 9 days ago, at .* It is built when 7 or more days have passed\.$/);
  const future = reviewPageDue(ago(-3 * DAY), NOW);
  assert.deepEqual([future.due, future.daysSinceBuilt], [true, -3], "a build time in the future is not trusted");
  assert.match(future.why, /is in the future/);
});

test("a recorded state that cannot be read is no state, so the Page is due; high-priority ids are text, and a new one is one the run before did not have", () => {
  for (const value of [null, "text", [], {}, { builtAt: 7 }, { builtAt: "last week" }, { builtAt: "2026-03-01" }, { builtAt: "2026-13-45T00:00:00Z" }]) {
    assert.deepEqual(parseReviewPageState(value), NO_REVIEW_PAGE, JSON.stringify(value));
  }
  assert.deepEqual(parseReviewPageState({ builtAt: "2026-03-01T16:00:00.000Z", highPriority: ["a", 7, "b"], extra: true }), { builtAt: "2026-03-01T16:00:00.000Z", highPriority: ["a", "b"] });
  assert.deepEqual(parseHighPriority(["a", "b", "a"]), ["a", "b"]);
  assert.deepEqual(parseHighPriority([]), []);
  for (const value of [{}, "a", [7], [""], [null]]) assert.equal(codeOf(() => parseHighPriority(value)), "E_INPUT_SCHEMA", JSON.stringify(value));
  assert.deepEqual(newHighPriority(["a", "b"], ["b", "c", "d"]), ["c", "d"]);
  assert.deepEqual(newHighPriority([], ["a"]), ["a"]);
  assert.deepEqual(newHighPriority(["a"], []), []);
});

test("the build time and the high-priority ids are kept in one file under the home, written only when a build or a list is given, and never under the private data directory", (t) => {
  const home = scratch(t);
  const file = reviewPageStatePath(home);
  assert.equal(file, join(home, "template", "review-page.json"));
  const asked = reviewPage({ home, now: NOW, built: false, highPriority: null });
  assert.deepEqual([asked.due, asked.builtAt, asked.recorded, asked.file, asked.everyDays], [true, null, false, file, 7]);
  assert.throws(() => readFileSync(file), "asking writes nothing");

  const listed = reviewPage({ home, now: NOW, built: false, highPriority: ["failing-routine"] });
  assert.deepEqual([listed.due, listed.newHighPriority, listed.highPriority], [true, ["failing-routine"], ["failing-routine"]]);
  const built = reviewPage({ home, now: NOW, built: true, highPriority: null });
  assert.deepEqual([built.due, built.recorded, built.builtAt, built.daysSinceBuilt, built.highPriority], [false, true, NOW.toISOString(), 0, ["failing-routine"]]);
  assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { builtAt: NOW.toISOString(), highPriority: ["failing-routine"] });

  const sixth = reviewPage({ home, now: new Date(NOW.getTime() + 6 * DAY), built: false, highPriority: ["failing-routine", "weekly-limit"] });
  assert.deepEqual([sixth.due, sixth.daysSinceBuilt, sixth.newHighPriority], [false, 6, ["weekly-limit"]]);
  const seventh = reviewPage({ home, now: new Date(NOW.getTime() + 7 * DAY - 2 * MINUTE), built: false, highPriority: ["failing-routine", "weekly-limit"] });
  assert.deepEqual([seventh.due, seventh.daysSinceBuilt, seventh.newHighPriority], [true, 7, []]);
  const rebuilt = reviewPage({ home, now: new Date(NOW.getTime() + 7 * DAY), built: true, highPriority: [] });
  assert.deepEqual([rebuilt.due, rebuilt.daysSinceBuilt, rebuilt.highPriority], [false, 0, []]);

  writeFileSync(file, "not json");
  assert.equal(reviewPage({ home, now: NOW, built: false, highPriority: null }).due, true, "a damaged file makes the Page due instead of putting it off");
  assert.equal(codeOf(() => reviewPage({ home: "/home/box/agent-data/ambitious", now: NOW, built: true, highPriority: null })), "E_FORBIDDEN_PATH");
});

test("a guide is found by its topic, an unknown topic is a usage error that names the topics, and its file is written under template/guides in the home", (t) => {
  const guides = parseGuides([
    { topic: "sync", title: "The sync result", text: "# The sync result\n\nText.\n" },
    { topic: "daily-update", title: "The daily update check", text: "# The daily update check\n" },
  ]);
  assert.equal(guideFor(guides, "daily-update").title, "The daily update check");
  try {
    guideFor(guides, "nothing");
    assert.fail("an unknown topic must be refused");
  } catch (error) {
    assert(error instanceof Failure);
    assert.deepEqual([error.errors[0].code, error.errors[0].message], ["E_USAGE", 'There is no guide named "nothing".']);
    assert.match(error.errors[0].hint, /^The guides are sync, daily-update\./);
  }
  for (const value of [{}, [{}], [{ topic: "Sync", title: "T", text: "x" }], [{ topic: "../sync", title: "T", text: "x" }], [{ topic: "sync", title: "", text: "x" }], [{ topic: "sync", title: "T", text: "" }]]) {
    assert.throws(() => parseGuides(value), /embedded guide/, JSON.stringify(value));
  }
  const home = scratch(t);
  mkdirSync(join(home, "template"), { recursive: true });
  const [first] = guides;
  assert(first !== undefined);
  const path = placeGuideFile(home, first);
  assert.equal(path, join(home, "template", "guides", "sync.md"));
  assert.equal(readFileSync(path, "utf8"), first.text);
  assert.equal(codeOf(() => placeGuideFile("/home/box/agent-data/ambitious", first)), "E_FORBIDDEN_PATH");
});
