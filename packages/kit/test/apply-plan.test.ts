import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { instructionsAction, overallAction, SELF_WRITE, truncatedFrom, type PlanAction } from "../src/domain/apply-plan.ts";
import { Failure } from "../src/domain/failure.ts";
import { SELF_APPLY_GRANT, type InstructionsCatalogue } from "../src/domain/instructions.ts";
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

type Given = { readonly current: string; readonly target?: string; readonly sha256?: string; readonly routines?: readonly RoutineOffer[]; readonly readBack?: string; readonly state?: string };

const RULE = "Apply a verified release to yourself.";
const granting = `${published}${RULE}\nTell the owner afterwards.\n`.replace("version: 2", "version: 3");
const grantingCatalogue: InstructionsCatalogue = {
  version: 3,
  oldestSupported: 1,
  text: granting,
  known: [...catalogue.known, { version: 3, ...fingerprintOf(granting) }],
  grants: { ...catalogue.grants, [SELF_APPLY_GRANT]: "Apply a verified release to itself." },
  versions: [...catalogue.versions, { version: 3, text: granting, grants: ["pages", "updates", SELF_APPLY_GRANT], reasons: {} }],
};

const ruleFirst = `Instructions version: 3\n\nKeep private data local.\n${RULE}\nUse Pages.\nAnswer briefly.\n`;
const ruleFirstCatalogue: InstructionsCatalogue = {
  ...grantingCatalogue,
  text: ruleFirst,
  known: [...catalogue.known, { version: 3, ...fingerprintOf(ruleFirst) }],
  versions: [...catalogue.versions, { version: 3, text: ruleFirst, grants: ["pages", "updates", SELF_APPLY_GRANT], reasons: {} }],
};

const planner = (t: TestContext, known: InstructionsCatalogue = catalogue): ((given: Given) => ApplyPlan) => {
  const home = mkdtempSync(join(tmpdir(), "ambitious-apply-plan-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const file = (name: string, text: string | undefined): string | null => {
    if (text === undefined) return null;
    writeFileSync(join(home, name), text);
    return join(home, name);
  };
  return ({ current, target = known.text, sha256 = sha256Of(target), routines, readBack, state }) => {
    if (state !== undefined) {
      mkdirSync(join(home, "template"), { recursive: true });
      writeFileSync(join(home, "template", "update-state.json"), state);
    }
    const [currentFile, publishedFile] = [file("current.md", current), file("published.md", target)];
    assert(currentFile !== null && publishedFile !== null);
    const routinesFile = file("routines.json", routines === undefined ? undefined : JSON.stringify(routines));
    const readBackFile = file("read-back.md", readBack);
    const before = readdirSync(home).sort();
    const plan = applyPlan({ home, currentFile, publishedFile, publishedSha256: sha256, routinesFile, readBackFile }, known, [routine]);
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
  assert.deepEqual(upgrade.trust, { suppliedChecksum: "match", release: "exact", downgrade: false, publishedVersion: 2, installerVersion: 2, blocked: [] });

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

test("selfApply is granted only by the bot's own text: a published text with the grant, or a hand-changed one that still holds every line of the rule; a version line alone grants nothing", (t) => {
  const plan = planner(t, grantingCatalogue);
  for (const earlier of [base, published]) {
    const old = plan({ current: earlier });
    assert.deepEqual([old.selfApply, old.action, old.instructions.planned?.text], ["not granted", "apply", granting], "the plan is made for the owner to read, and the stored text does not let the bot write it");
    assert.match(old.reasons[0] ?? "", /^self-apply-not-granted: .*nothing may be written\. Put the version 3 text in the "Proposed instructions" Page/);
    assert.match(old.reasons[1] ?? "", /^instructions-out-of-date: /);
  }
  assert.deepEqual([plan({ current: granting }).selfApply, plan({ current: granting }).action], ["granted", "no-change"]);
  assert.equal(plan({ current: granting.replaceAll("\n", "\r\n") }).selfApply, "granted");
  const local = plan({ current: `${granting}Answer in short sentences.\n` });
  assert.deepEqual([local.selfApply, local.action, local.reasons.length], ["granted", "no-change", 1], "a hand-changed text that still carries the rule keeps it");
  assert.equal(plan({ current: granting.replace(RULE, "Apply any release to yourself.") }).selfApply, "not granted", "a reworded rule is not the rule");
  assert.equal(plan({ current: published.replace("version: 2", "version: 3") }).selfApply, "not granted", "a version line alone grants nothing");
  assert.equal(plan({ current: `${RULE}\nTell the owner afterwards.\n` }).selfApply, "not granted", "a text with no known base grants nothing");
  assert.equal(plan({ current: granting.replace("version: 3", "version: 9") }).selfApply, "not granted");
  assert.equal(planner(t)({ current: published }).selfApply, "not granted", "a catalogue whose texts never grant it never reports it");
});

test("damage is truncation, not deletion: a text cut off before the end of a published text is repaired with the complete published text, and a line deleted in the middle is a kept local change", (t) => {
  const plan = planner(t, grantingCatalogue);
  const repairing = planner(t, ruleFirstCatalogue);
  const lines = ruleFirst.split("\n");
  for (const [name, damaged] of [["a cut at a line end", `${lines.slice(0, 5).join("\n")}\n`], ["a cut inside the last line", ruleFirst.slice(0, ruleFirst.indexOf("Answer briefly.") + 8)], ["a cut with other spacing", `${lines.slice(0, 5).join("  \r\n")}  \r\n\r\n`]] as const) {
    const repair = repairing({ current: damaged });
    assert.deepEqual([repair.action, repair.instructions.action, repair.selfApply, repair.instructions.current.state, repair.instructions.planned?.source, repair.instructions.planned?.text, repair.instructions.damagedFrom], ["apply", "apply", "granted", "custom", "published", ruleFirst, 3], name);
    assert.deepEqual(repair.reasons, ["instructions-damaged: The instructions are the published version 3 text cut off before its end, as after a truncated or partial write, so limits that text states are missing. The complete published version 3 text is applied to repair them."], name);
    assert.deepEqual([repair.previous.archiveFirst, repair.merge.state], [false, "not needed"]);
  }
  const lostTheRule = plan({ current: granting.slice(0, granting.indexOf(RULE)) });
  assert.deepEqual([lostTheRule.action, lostTheRule.selfApply, lostTheRule.instructions.damagedFrom, lostTheRule.instructions.planned?.text], ["apply", "not granted", 3, granting], "a text that lost the rule itself is still planned, for the owner to read");
  assert.equal(lostTheRule.reasons.length, 1, "a damaged text is not sent down the proposal path: there is no self-apply-not-granted reason");
  assert.match(lostTheRule.reasons[0] ?? "", /^instructions-damaged: The instructions are the published version 3 text cut off before its end, .* This bot may not repair them itself, and nothing may be written\. Tell the owner plainly, in this bot's own chat, that the instructions are damaged, on every daily run until they are repaired, with the kept previous text and the complete published version 3 text in a Page for the owner to set\. This is not the "Proposed instructions" proposal\.$/);

  const deleted = plan({ current: granting.replace("Use Pages.\n", "") });
  assert.deepEqual([deleted.action, deleted.selfApply, deleted.instructions.planned, deleted.instructions.damagedFrom, deleted.merge.localChangesKept.length], ["no-change", "granted", null, null, 1], "a published line the owner deleted is a local change that is kept, never damage");
  assert.match(deleted.reasons[0] ?? "", /^instructions-custom: The instructions are the version 3 text with 1 local change, which are kept\.$/);
  const earlierDeleted = `${published.replace("Use Pages.\n", "")}`;
  const dayOne = plan({ current: earlierDeleted });
  assert.deepEqual([dayOne.action, dayOne.instructions.planned?.source, dayOne.merge.localChangesKept.length, dayOne.instructions.damagedFrom], ["apply", "merged", 1, null], "day 1: a hand-changed earlier text is merged and keeps the deletion");
  const dayTwo = plan({ current: dayOne.instructions.planned?.text ?? "" });
  assert.deepEqual([dayTwo.action, dayTwo.instructions.planned, dayTwo.instructions.damagedFrom], ["no-change", null, null], "day 2: the merged text is still a kept local change, not damage");
  const changed = plan({ current: `${granting.replace("Use Pages.\n", "")}Answer in short sentences.\n` });
  assert.deepEqual([changed.action, changed.instructions.planned], ["no-change", null], "a text with wording of its own is kept");

  const older = plan({ current: published.slice(0, published.indexOf("Answer briefly.") + 6) });
  assert.deepEqual([older.action, older.instructions.damagedFrom, older.instructions.planned?.source, older.merge.state, older.selfApply], ["apply", 2, "published", "not needed", "not granted"], "a cut-off earlier published text is damage too: it is not merged with its missing end counted as a local change");
  assert.match(older.reasons[0] ?? "", /^instructions-damaged: The instructions are the published version 2 text cut off before its end/);

  const held = repairing({ current: `${lines.slice(0, 5).join("\n")}\n`, state: JSON.stringify({ restoredOver: { version: 3, sha256: sha256Of(ruleFirst) } }) });
  assert.deepEqual([held.action, held.instructions.restoredOver, held.instructions.planned?.text], ["apply", null, ruleFirst], "a damaged text is repaired even when a restore over this same published text is recorded");

  const custom = { state: "custom", problem: "instructions-custom", current: 3, template: 3, match: null } as const;
  const texts = [{ version: 2, folded: "Instructions version: 2\nA\nB" }, { version: 3, folded: "Instructions version: 3\nA\nB\nC" }];
  assert.deepEqual(truncatedFrom(custom, "Instructions version: 3\nA\nB", texts), { version: 3 });
  assert.deepEqual(truncatedFrom(custom, "Instructions version: 3\nA\nB\n", texts), { version: 3 }, "a cut inside the last line or at a line end");
  assert.equal(truncatedFrom(custom, "Instructions version: 3\nA\nC", texts), null, "an interior deletion is not a prefix");
  assert.equal(truncatedFrom(custom, "Instructions version: 3\nA\nB\nC", texts), null, "the whole text is not a proper prefix");
  assert.equal(truncatedFrom({ ...custom, current: null }, "Instr", texts), null, "a text without a version line is not classified as a cut-off published text");
  assert.equal(truncatedFrom({ state: "current", problem: null, current: 3, template: 3, match: "exact" }, "Instructions version: 3\nA", texts), null);
});

test("a failed apply is held: the same published text is not written again until a later release, the owner asks, or once more after a plain refused call", (t) => {
  const plan = planner(t, grantingCatalogue);
  const failedApply = { time: "2026-01-01T07:00:00Z", step: "read-back", kind: "landed-wrong", attempts: 1, version: 3, sha256: sha256Of(granting), previousInPlace: true };
  const held = plan({ current: granting, state: JSON.stringify({ failedApply }) });
  assert.equal(held.action, "no-change", "nothing is held when the text is current");
  assert.equal(held.instructions.failedApply, null);
  const local = base.replace("Keep private data local.", "Keep private data on this computer.");
  const again = plan({ current: local, state: JSON.stringify({ failedApply }) });
  assert.deepEqual([again.action, again.instructions.action, again.instructions.planned, again.permissions, again.instructions.failedApply?.sha256], ["no-change", "no-change", null, null, sha256Of(granting)]);
  assert.deepEqual(again.reasons, ["failed-apply-held: An earlier write of this same published version 3 text to the instructions failed (landed-wrong), so it is not tried again. A later verified release is applied, and this one when the owner asks for it in this bot's own chat."]);
  assert.equal(plan({ current: base, state: JSON.stringify({ failedApply }) }).reasons.length, 1, "a no-change plan needs no self-apply reason");
  const later = plan({ current: local, state: JSON.stringify({ failedApply: { ...failedApply, sha256: sha256Of("an earlier release") } }) });
  assert.deepEqual([later.instructions.action, later.instructions.failedApply], ["apply", null], "a release with another SHA-256 is applied");
  assert.equal(plan({ current: local, state: JSON.stringify({ lastAction: "apply" }) }).instructions.action, "apply", "once the owner asked and the entry is removed, it is planned again");
  const refused = plan({ current: local, state: JSON.stringify({ failedApply: { ...failedApply, kind: "refused" } }) });
  assert.deepEqual([refused.instructions.action, refused.instructions.failedApply], ["apply", null], "a plain refused call is tried once more");
  for (const twice of [{ ...failedApply, kind: "refused", attempts: 2 }, { ...failedApply, kind: "blocked" }, { version: 3, sha256: sha256Of(granting) }]) {
    assert.equal(plan({ current: local, state: JSON.stringify({ failedApply: twice }) }).instructions.action, "no-change", JSON.stringify(twice));
  }

  const cut = `${ruleFirst.split("\n").slice(0, 5).join("\n")}\n`;
  const damaged = planner(t, ruleFirstCatalogue)({ current: cut, state: JSON.stringify({ failedApply: { ...failedApply, sha256: sha256Of(ruleFirst) } }) });
  assert.deepEqual([damaged.action, damaged.selfApply, damaged.instructions.damagedFrom, damaged.instructions.planned], ["no-change", "granted", 3, null], "a damaged text whose repair already failed is not written again");
  assert.deepEqual(damaged.reasons.map((reason) => reason.split(":")[0]), ["failed-apply-held", "instructions-damaged"]);
  assert.match(damaged.reasons[1] ?? "", /This bot may not repair them itself, and nothing may be written\. Tell the owner plainly, .* on every daily run until they are repaired/, "the owner is told on every run, because nothing else repairs it");

  const earlier: RoutineOffer = { name: routine.name, schedule: routine.schedule, prompt: earlierPrompt };
  const routineFailed = { ...failedApply, step: "UpdateRoutine", kind: "blocked", routine: { name: routine.name, sha256: sha256Of(prompt) } };
  const routines = plan({ current: granting, routines: [earlier], state: JSON.stringify({ failedApply: routineFailed }) });
  assert.deepEqual([routines.action, routines.routines.routines[0]?.state, routines.routines.routines[0]?.action, routines.routines.routines[0]?.held], ["no-change", "out-of-date", "no-change", true]);
  assert.match(routines.reasons[1] ?? "", /^failed-apply-held: An earlier write of this same published prompt to the routine ambitious-selfcheck failed, so it is not tried again\./);
  const otherPrompt = plan({ current: granting, routines: [earlier], state: JSON.stringify({ failedApply: { ...routineFailed, routine: { name: routine.name, sha256: sha256Of("an earlier prompt") } } }) });
  assert.equal(otherPrompt.routines.routines[0]?.action, "apply", "a release with another prompt is applied");
  for (const state of [JSON.stringify({ failedApply: "yes" }), JSON.stringify({ failedApply: { version: 3 } }), JSON.stringify({ failedApply: { sha256: sha256Of(granting), routine: { name: routine.name } } })]) {
    assert.throws(() => plan({ current: local, state }), (error) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA", state);
  }
});

test("a restore sticks: the published text the owner restored over is not planned again, a later release is, and an unreadable state stops the plan", (t) => {
  const plan = planner(t);
  const custom: RoutineOffer = { name: routine.name, schedule: "daily", prompt: "Post a summary every day." };
  const restored = plan({ current: base, routines: [custom], state: JSON.stringify({ seen: ["a1"], restoredOver: { version: 2, sha256: sha256Of(published) } }) });
  assert.deepEqual([restored.instructions.action, restored.instructions.planned, restored.permissions, restored.instructions.restoredOver], ["no-change", null, null, { version: 2, sha256: sha256Of(published) }]);
  assert.deepEqual(restored.reasons.map((reason) => reason.split(":")[0]), ["self-apply-not-granted", "restored-by-owner", "routine-custom"]);
  assert.match(restored.reasons[1] ?? "", /^restored-by-owner: The owner restored the earlier instructions over this same published version 2 text, so it is not applied again\./);
  assert.deepEqual([restored.action, restored.routines.routines[0]?.action], ["apply-published-and-archive", "apply-published-and-archive"], "the routines are still planned");
  assert.equal(plan({ current: base, state: JSON.stringify({ restoredOver: { version: 2, sha256: sha256Of(published) } }) }).action, "no-change", "the day after a restore, the plan is no-change");
  const later = plan({ current: base, state: JSON.stringify({ restoredOver: { version: 1, sha256: sha256Of("an earlier release") } }) });
  assert.deepEqual([later.action, later.instructions.restoredOver, later.instructions.planned?.text], ["apply", null, published], "a release with another SHA-256 is applied");
  assert.equal(plan({ current: published, state: JSON.stringify({ restoredOver: { version: 2, sha256: sha256Of(published) } }) }).instructions.restoredOver, null, "nothing to hold back when the text is current");
  assert.equal(plan({ current: base, state: JSON.stringify({ restoredOver: null, action: "apply" }) }).action, "apply");
  for (const state of ["not json", "[]", JSON.stringify({ restoredOver: { version: 2 } }), JSON.stringify({ restoredOver: "yes" })]) {
    assert.throws(() => plan({ current: base, state }), (error) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA", state);
  }
});

test("only the exact bytes inside the installer pass: a published text that differs in spacing is blocked, while spacing is still set aside for the bot's own text and for a read-back", (t) => {
  const plan = planner(t);
  const respaced = plan({ current: base, target: `${published.replaceAll("\n", "  \r\n")}\r\n` });
  assert.deepEqual([respaced.action, respaced.trust.suppliedChecksum, respaced.trust.release, respaced.trust.blocked, respaced.instructions.planned], ["blocked", "match", "whitespace", ["release-checksum-mismatch"], null]);
  assert.match(respaced.reasons[0] ?? "", /it is not, byte for byte, the version 2 text inside this verified installer/);
  assert.equal(plan({ current: base.replaceAll("\n", "\r\n") }).action, "apply");
  const back = plan({ current: base, readBack: base });
  assert.deepEqual([back.readBack?.match, back.readBack?.previousMatch], [null, "exact"], "a read-back that is still the previous text says so");
  assert.deepEqual([plan({ current: base, readBack: published.slice(0, 40) }).readBack?.previousMatch, plan({ current: base, readBack: `${base}\n` }).readBack?.previousMatch], [null, "whitespace"]);
});

test("two routines with the same name are planned one by one: the hand-written one is archived, and each says which one it is", (t) => {
  const plan = planner(t, grantingCatalogue);
  const earlier: RoutineOffer = { name: routine.name, schedule: "every day at 7:00 AM", prompt: earlierPrompt };
  const handWritten: RoutineOffer = { name: routine.name, schedule: "every Friday", prompt: "Post a summary every Friday." };
  const both = plan({ current: granting, routines: [earlier, handWritten, { name: "weekly-digest", schedule: "weekly", prompt: "Summarise." }] });
  assert.equal(both.action, "apply-published-and-archive");
  assert.deepEqual(both.routines.routines.map(({ state, action, archive, sameName, presentSha256, schedule }) => [state, action, archive, sameName, presentSha256, schedule.current]), [
    ["out-of-date", "apply", null, 2, sha256Of(earlierPrompt), earlier.schedule],
    ["custom", "apply-published-and-archive", handWritten, 2, sha256Of(handWritten.prompt), handWritten.schedule],
  ]);
  assert.deepEqual(both.reasons.slice(1).map((reason) => reason.split(":")[0]), ["routine-prompt-out-of-date", "routine-custom"]);
  assert.match(both.reasons[2] ?? "", /^routine-custom: One of the 2 routines named ambitious-selfcheck, the one on the schedule "every Friday", runs a prompt that no template published\./);
  const twice = plan({ current: granting, routines: [{ ...earlier, prompt }, handWritten] });
  assert.deepEqual(twice.routines.routines.map(({ state, archive }) => [state, archive]), [["current", null], ["custom", handWritten]], "a current routine beside it does not hide the hand-written one");
  const single = plan({ current: granting, routines: [handWritten] });
  assert.deepEqual([single.routines.routines.length, single.routines.routines[0]?.sameName, single.routines.routines[0]?.archive], [1, 1, handWritten]);
  assert.deepEqual(plan({ current: granting, routines: [] }).routines.routines.map(({ state, sameName, presentSha256 }) => [state, sameName, presentSha256]), [["missing", 0, null]]);
});
