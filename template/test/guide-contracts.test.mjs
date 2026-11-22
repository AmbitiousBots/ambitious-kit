import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ACTOR_MAX_CHARACTERS, ACTOR_RULE } from "../../packages/kit/src/domain/actor.ts";
import { guideText, repoRoot, skillOnly } from "./support.mjs";

const ACTOR_SENTENCE =
  "A write `actor` is 1 to 200 Unicode characters, with no control characters or line breaks, no leading or trailing whitespace, and internal spaces allowed. Nothing is trimmed. The `E_INPUT_SCHEMA` hint states this rule. When the installed module refuses such an actor, it has its own older rule: follow its message.";
const ACTOR_GUIDES = ["records", "compliance", "tasks", "contracts", "scheduling"];
const NOT_GENERIC = /Alexander|\bDash\b|\bHAL\b|Aristapoint/u;

const count = (text, part) => text.split(part).length - 1;
const jsonExamples = (topic) => [...guideText(topic).matchAll(/```json\n(.*?)\n```/gsu)].map(([, body]) => JSON.parse(body));
const section = (topic, heading) => guideText(topic).split("\n## ").find((part) => part.startsWith(`${heading}\n`)) ?? "";

test("each guide that names a write actor states the actor rule once, in the same words, and the rule is the one the kit's parser enforces", () => {
  for (const topic of ACTOR_GUIDES) {
    const guide = guideText(topic);
    assert.match(guide, /`actor`/u, `${topic} names actor`);
    assert.equal(count(guide, ACTOR_SENTENCE), 1, `${topic} states the actor rule exactly once`);
    assert.equal(count(guide, "Nothing is trimmed."), 1, `${topic} does not restate the rule in other words`);
    assert.equal(count(guide, "it has its own older rule: follow its message."), 1, `${topic} says once what to do when the installed module still has an older actor rule`);
  }
  assert.equal(ACTOR_MAX_CHARACTERS, 200);
  for (const part of ["1 to 200 Unicode characters", "no control characters or line breaks", "no leading or trailing whitespace", "Nothing is trimmed."]) {
    assert.ok(ACTOR_SENTENCE.includes(part) && ACTOR_RULE.includes(part), `the guides and the kit's E_INPUT_SCHEMA hint both say: ${part}`);
  }
  assert.ok(ACTOR_SENTENCE.includes("internal spaces allowed") && ACTOR_RULE.includes("Internal spaces are allowed."));
});

test("the records guide says how a type name is spelled, beside the definition keys and the field kinds it already listed", () => {
  const guide = guideText("records");
  assert.ok(
    guide.includes("A type name is lower-case words joined by hyphens, for example `sales-deal`, not underscores. Field and stage names are lower-case words joined by underscores.\n"),
    "the naming rule is one line",
  );
  assert.ok(guide.includes("A type definition: `type`, `version`, `fields`, `stages`, `initial`, `transitions`, `terminal`"));
  assert.ok(guide.includes("Field kinds are `string`, `text`, `int`, `decimal`, `money`, `date`, `datetime`, `bool`, `enum` and `ref`."));
  const skill = skillOnly("ambitious-records-for-bots");
  assert.doesNotMatch(skill, /`transitions`|`terminal`/u, "the records skill lists no definition key, so the naming rule lives in the guide alone");
  assert.match(skill, /guide records --json/u);
});

test("the compliance guide says what evidence weight is, what can turn a control green or yellow, the expires-soon window, and that a color is never a met requirement", () => {
  const guide = guideText("compliance");
  for (const required of [
    "Evidence may carry a `weight` of `official`, `draft` or `decision`.",
    "`kind` is not the weight, and omitting `weight` stores official evidence.",
    "Only current official evidence, or a current attestation, can turn a control green or yellow.",
    "Draft and decision rows stay in `gaps`, stay out of the official `expiring` clock, and are reported as documented, not as official support.",
    "The expires-soon window defaults to 30 days, is configurable with `withinDays` on `status` and `expiring`, and is reported in the result.",
    "Status colors describe only what is on record; never state that a requirement is met.",
    "| Proof was collected | `evidence add` | `id`, `controlId`, `kind`, `summary`, `collectedAt`, `expiresAt`, optional `weight`, optional `page` |",
    "| The owner asks where things stand | `status` | `programId`, optional `withinDays` |",
    "| Planning renewals | `expiring` | `programId`, optional `withinDays` |",
    "When the installed module refuses `weight` on `evidence add` or `withinDays` on `status` with `E_INPUT_SCHEMA`, it does not have them yet: leave the field out and tell the owner so.",
    "When it refuses `expiring` without `withinDays`, it still requires the field: send `withinDays`, 30 for the default window.",
    "report its statuses as the state of the register, never as a compliance opinion",
  ]) {
    assert.ok(guide.includes(required), `the compliance guide says: ${required}`);
  }
  assert.doesNotMatch(guide, /refuses `weight` or `withinDays`/u, "the fallback never tells the bot to leave out a field that `expiring` still requires");
  assert.doesNotMatch(guide, /\b(?:is|are|stay|stays|become|becomes|makes? (?:you|it|them)) compliant\b|\bcertified\b|\bguarantee/iu, "the guide claims no compliance");
  const skill = skillOnly("ambitious-compliance-for-bots");
  assert.ok(skill.includes("report its statuses as the state of the register, never as a compliance opinion"));
  assert.ok(skill.includes("Copy colors and reasons from `status`; never work them out yourself."));
  assert.doesNotMatch(skill, /\bred\b|\byellow\b|\bgreen\b/u, "the compliance skill does not describe the colors, so what a color means lives in the guide alone");
});

test("the tasks guide says how a task moves to another list and which fields next returns", () => {
  const guide = guideText("tasks");
  for (const required of [
    "Move a task to another list with `list move`, input `{id, list, idem_key?, actor?}`: the task keeps its id and the move is recorded in its history.",
    "`update` with `patch.list` remains valid.",
    "For each task it returns the display fields `board` returns, among them `assignee`, `due` and `priority`, with a field that has no value present as `null`, plus `score` and `reasons`.",
  ]) {
    assert.ok(guide.includes(required), `the tasks guide says: ${required}`);
  }
});

test("the tasks guide shows schedule suggest for one person over 14 days, with horizon_days and the people roster and nothing of the calendar flow", () => {
  const sketch = section("tasks", "A minimal schedule sketch: one person, weekday hours, 14 days");
  for (const required of [
    "`schedule suggest` requires `horizon_days`, a number from 0 to 36600, and takes the people in the request body.",
    "A person is `id`, `capacity_days_per_week` and `windows`",
    "Suggestions do not persist people",
    "`NO_FEASIBLE_SLOT`",
    "check `horizon_days`, `capacity_days_per_week` and `windows`",
    "`plan propose`, which takes a `tasks-snapshot.v1` and a `horizon` with `start` and `end`, never `horizon_days` or `people`",
    "Do not mix the two inputs in one command.",
  ]) {
    assert.ok(sketch.includes(required), `the sketch says: ${required}`);
  }
  const examples = jsonExamples("tasks");
  assert.equal(examples.length, 1, "one command example, for schedule suggest alone");
  const [suggest] = examples;
  assert.deepEqual(Object.keys(suggest), ["horizon_days", "people"], "the example holds only the two fields of schedule suggest");
  assert.equal(suggest.horizon_days, 14);
  assert.equal(suggest.people.length, 1);
  const [person] = suggest.people;
  assert.deepEqual(Object.keys(person), ["id", "capacity_days_per_week", "windows"]);
  assert.equal(person.capacity_days_per_week, 5);
  for (const { start, end } of person.windows) {
    assert.match(start, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/u);
    assert.equal((Date.parse(end) - Date.parse(start)) / 86_400_000, 14, "the one window covers the 14-day horizon");
  }
});

test("the scheduling guide shows calendar add with tz, availability set with weekday wall times, and plan propose with a snapshot and a horizon, each as its own command", () => {
  const sketch = section("scheduling", "A minimal sketch: one person, weekday hours, 14 days");
  for (const required of [
    "The field is `tz`, an IANA zone name; `timezone` is refused.",
    "`availability set`, with weekday rules in the calendar's local wall time",
    "`plan propose`, with the task rows wrapped as a `tasks-snapshot.v1` and a 14-day `horizon` given as `start` and `end`",
    "`ambitious-tasks schedule suggest` is a different flow with a different input: `horizon_days` and a `people` roster of `id`, `capacity_days_per_week` and `windows`, sent with every call and never stored.",
    "Do not mix the two inputs in one command",
  ]) {
    assert.ok(sketch.includes(required), `the sketch says: ${required}`);
  }
  const examples = [...sketch.matchAll(/```json\n(.*?)\n```/gsu)].map(([, body]) => JSON.parse(body));
  assert.equal(examples.length, 3);
  const [calendar, availability, propose] = examples;
  assert.deepEqual(Object.keys(calendar), ["id", "name", "tz", "kind", "person_ref", "idem_key"]);
  assert.match(calendar.tz, /^[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+$/u, "tz is an IANA zone name");
  assert.deepEqual(Object.keys(availability), ["calendar_id", "expected_version", "rules", "exceptions", "idem_key"]);
  assert.deepEqual(availability.rules, [{ days: ["MO", "TU", "WE", "TH", "FR"], start: "09:00", end: "17:00" }]);
  assert.equal(availability.calendar_id, calendar.id);
  assert.deepEqual(Object.keys(propose), ["tasks", "horizon", "policy"]);
  assert.equal(propose.tasks.schema, "tasks-snapshot.v1");
  assert.equal((Date.parse(propose.horizon.end) - Date.parse(propose.horizon.start)) / 86_400_000, 14);
  for (const example of examples) {
    for (const foreign of ["horizon_days", "people", "timezone", "capacity_days_per_week", "windows"]) {
      assert.ok(!JSON.stringify(example).includes(`"${foreign}"`), `no scheduling example holds ${foreign}`);
    }
  }
});

test("the guides stay generic, and the notice names the one copyright holder", () => {
  for (const topic of ACTOR_GUIDES) assert.doesNotMatch(guideText(topic), NOT_GENERIC, `${topic} names no person, bot or customer`);
  assert.equal(readFileSync(join(repoRoot, "NOTICE"), "utf8").split("\n")[1], "Copyright 2026 Ambitious Corporation");
});
