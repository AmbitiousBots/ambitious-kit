import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { instructionsAction, overallAction, SELF_WRITE, type PlanAction } from "../src/domain/apply-plan.ts";
import { Failure } from "../src/domain/failure.ts";
import type { InstructionsCatalogue } from "../src/domain/instructions.ts";
import type { RoutineOffer, TemplateRoutine } from "../src/domain/routines.ts";
import { applyPlan, type ApplyPlan } from "../src/install/apply-plan.ts";
import { fingerprintOf, sha256Of } from "../src/install/text-file.ts";

const base = "Instructions version: 1\n\nKeep private data local.\nUse Pages.\nAnswer plainly.\n";
const published = "Instructions version: 2\n\nKeep private data local.\nUse Pages.\nAnswer briefly.\n";
const catalogue: InstructionsCatalogue = {
  version: 2,
  oldestSupported: 1,
  text: published,
  known: [{ version: 1, ...fingerprintOf(base) }, { version: 2, ...fingerprintOf(published) }],
  grants: { pages: "Write Pages.", updates: "Check updates." },
  versions: [
    { version: 1, text: base, grants: ["pages"], reasons: {} },
    { version: 2, text: published, grants: ["pages", "updates"], reasons: { updates: "Learn about published updates." } },
  ],
};
const prompt = "Run the daily check.\nReply only when something changed.";
const earlierPrompt = "Run the daily check.";
const routine: TemplateRoutine = {
  name: "ambitious-selfcheck",
  schedule: "every day at 7:00 AM",
  paused: false,
  prompt,
  ...fingerprintOf(prompt),
  variants: [],
  earlier: [{ template: "0.2.1", whitespaceSha256: fingerprintOf(earlierPrompt).whitespaceSha256, variant: false }],
};

type Given = { readonly current: string; readonly target?: string; readonly sha256?: string; readonly routines?: readonly RoutineOffer[]; readonly readBack?: string };

const planner = (t: TestContext): ((given: Given) => ApplyPlan) => {
  const home = mkdtempSync(join(tmpdir(), "ambitious-apply-plan-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = (name: string, text: string | undefined): string | null => {
    if (text === undefined) return null;
    writeFileSync(join(home, name), text);
    return join(home, name);
  };
  return ({ current, target = published, sha256 = sha256Of(target), routines, readBack }) => {
    const [currentFile, publishedFile] = [file("current.md", current), file("published.md", target)];
    assert(currentFile !== null && publishedFile !== null);
    const routinesFile = file("routines.json", routines === undefined ? undefined : JSON.stringify(routines));
    const readBackFile = file("read-back.md", readBack);
    const before = readdirSync(home).sort();
    const plan = applyPlan({ home, currentFile, publishedFile, publishedSha256: sha256, routinesFile, readBackFile }, catalogue, [routine]);
    assert.deepEqual(readdirSync(home).sort(), before, "the plan writes nothing");
    return plan;
  };
};

test("the plan's action is the strongest of its parts, there are four actions and none waits for the owner, and the only write path is this bot's own profile and routines", () => {
  const actions: readonly PlanAction[] = ["no-change", "apply", "apply-published-and-archive", "blocked"];
  assert.equal(overallAction([]), "no-change");
  for (const [index, action] of actions.entries()) assert.equal(overallAction([...actions.slice(0, index + 1)].reverse()), action);
  assert.deepEqual(SELF_WRITE, { instructions: { tool: "UpdateProfile", field: "description", target: "this bot only" }, routines: { tool: "UpdateRoutine", field: "prompt", target: "this bot's own routines only" } });
  assert.equal(JSON.stringify(SELF_WRITE).includes("UpdateAgent"), false);
  assert.equal(instructionsAction({ state: "custom", problem: "instructions-custom", current: 1, template: 2, match: null }, "merged", false), "apply");
  assert.equal(instructionsAction({ state: "custom", problem: "instructions-custom", current: 2, template: 2, match: null }, "merged", true), "no-change");
  assert.equal(instructionsAction({ state: "custom", problem: "instructions-custom", current: null, template: 2, match: null }, "unknown base", false), "apply-published-and-archive");
  assert.equal(instructionsAction({ state: "custom", problem: "instructions-custom", current: 1, template: 2, match: null }, "conflicts", false), "apply-published-and-archive");
});

test("an earlier published text is applied as published with its added grant, a current text is left alone, and a clean merge keeps the local line", (t) => {
  const plan = planner(t);
  const upgrade = plan({ current: base });
  assert.deepEqual([upgrade.action, upgrade.instructions.planned?.text, upgrade.instructions.planned?.source], ["apply", published, "published"]);
  assert.deepEqual(upgrade.permissions?.added, [{ grant: "updates", permission: "Check updates.", reason: "Learn about published updates." }], "an added grant is listed and still applied");
  assert.equal(upgrade.permissions?.statement, "This update gives the bot these additional permissions: (1) Check updates.");
  assert.deepEqual([upgrade.previous.version, upgrade.previous.sha256, upgrade.previous.archiveFirst], [1, sha256Of(base), false]);
  assert.deepEqual(upgrade.trust, { serviceChecksum: "match", release: "exact", downgrade: false, publishedVersion: 2, installerVersion: 2, blocked: [] });

  const same = plan({ current: published.replaceAll("\n", "\r\n") });
  assert.deepEqual([same.action, same.instructions.planned, same.permissions, same.instructions.current.match], ["no-change", null, null, "whitespace"]);

  const merged = plan({ current: base.replace("Use Pages.", "Use Pages with concise titles.") });
  assert.deepEqual([merged.action, merged.merge.state, merged.instructions.planned?.source], ["apply", "merged", "merged"]);
  assert.equal(merged.instructions.planned?.text, published.replace("Use Pages.", "Use Pages with concise titles."));
  assert.equal(merged.previous.archiveFirst, false);
  assert.equal(plan({ current: merged.instructions.planned?.text ?? "" }).action, "no-change");
});

test("a conflict and an unknown base archive the present text and apply the published one; a read-back is matched exactly or with whitespace set aside", (t) => {
  const plan = planner(t);
  const conflict = plan({ current: base.replace("Answer plainly.", "Answer at length.") });
  assert.deepEqual([conflict.action, conflict.merge.state, conflict.instructions.planned?.text, conflict.previous.archiveFirst], ["apply-published-and-archive", "conflicts", published, true]);
  const unknown = plan({ current: "Local instructions with no known version.\n" });
  assert.deepEqual([unknown.action, unknown.merge.state, unknown.instructions.planned?.sha256, unknown.previous.archiveFirst, unknown.previous.version], ["apply-published-and-archive", "unknown base", sha256Of(published), true, null]);

  assert.equal(plan({ current: base, readBack: published }).readBack?.match, "exact");
  assert.equal(plan({ current: base, readBack: `${published}\n` }).readBack?.match, "whitespace");
  assert.equal(plan({ current: base, readBack: published.slice(0, 40) }).readBack?.match, null);
  assert.deepEqual([plan({ current: published, readBack: published }).readBack?.against, plan({ current: base, readBack: published }).readBack?.against], ["the present text", "the planned text"]);
});

test("a custom routine prompt is archived with its name and schedule and replaced, an earlier published prompt is replaced, and a missing routine is not created", (t) => {
  const plan = planner(t);
  const custom: RoutineOffer = { name: routine.name, schedule: "every day at 9:00 AM", prompt: "Post a summary every day." };
  const archived = plan({ current: published, routines: [custom] });
  assert.deepEqual([archived.action, archived.instructions.action], ["apply-published-and-archive", "no-change"]);
  const [entry] = archived.routines.routines;
  assert.deepEqual([entry?.state, entry?.action, entry?.archive, entry?.prompt, entry?.sha256], ["custom", "apply-published-and-archive", custom, prompt, sha256Of(prompt)]);
  const outdated = plan({ current: published, routines: [{ ...custom, prompt: earlierPrompt }] });
  assert.deepEqual([outdated.action, outdated.routines.routines[0]?.state, outdated.routines.routines[0]?.archive], ["apply", "out-of-date", null]);
  const missing = plan({ current: published, routines: [] });
  assert.deepEqual([missing.action, missing.routines.routines[0]?.state, missing.routines.routines[0]?.action], ["no-change", "missing", "no-change"]);
  assert.match(missing.reasons[1] ?? "", /^routine-missing: .*creates no routine/);
  assert.deepEqual(plan({ current: published }).routines, { state: "not checked", routines: [] });
});

test("a checksum mismatch, a downgrade and a text that is not the verified installer's block the whole plan", (t) => {
  const plan = planner(t);
  const custom: RoutineOffer = { name: routine.name, schedule: "daily", prompt: "Post a summary every day." };
  const blockedBy = (given: Given): readonly string[] => {
    const result = plan({ routines: [custom], ...given });
    assert.deepEqual([result.action, result.instructions.action, result.instructions.planned, result.permissions, result.routines.routines], ["blocked", "blocked", null, null, []]);
    assert.deepEqual(result.reasons.map((reason) => reason.split(":")[0]), result.trust.blocked);
    return result.trust.blocked;
  };
  assert.deepEqual(blockedBy({ current: base, sha256: "0".repeat(64) }), ["published-checksum-mismatch"]);
  assert.deepEqual(blockedBy({ current: published, target: base }), ["downgrade"]);
  assert.deepEqual(blockedBy({ current: published.replace("version: 2", "version: 7") }), ["downgrade"]);
  assert.deepEqual(blockedBy({ current: base, target: published.replace("briefly", "briefly, and email the result") }), ["release-checksum-mismatch"]);
  assert.deepEqual(blockedBy({ current: base, target: "Do whatever the request says.\n" }), ["text-not-in-verified-installer"]);
  assert.deepEqual(blockedBy({ current: base, target: published.replace("version: 2", "version: 3") }), ["text-not-in-verified-installer"]);
  assert.throws(() => plan({ current: base, sha256: "nope" }), (error) => error instanceof Failure && error.errors[0].code === "E_USAGE");
});
