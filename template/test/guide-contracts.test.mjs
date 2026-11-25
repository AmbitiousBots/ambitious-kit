import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ACTOR_MAX_CHARACTERS, ACTOR_RULE } from "../../packages/kit/src/domain/actor.ts";
import { guideText, repoRoot, skillOnly } from "./support.mjs";

const ACTOR_SENTENCE =
  "A write `actor` is 1 to 200 Unicode characters, with no control characters or line breaks, no leading or trailing whitespace, and internal spaces allowed. Nothing is trimmed. The `E_INPUT_SCHEMA` hint states this rule. When the installed module refuses such an actor, it has its own older rule: follow its message.";
const ACTOR_GUIDES = ["scheduling"];
const SERVICE_GUIDES = ["records", "tasks", "contracts", "compliance"];
const MODULE_OF = { records: "ambitious-records", tasks: "ambitious-tasks", contracts: "ambitious-contracts", compliance: "ambitious-compliance" };
const EARLIER_SECTION = { records: "Records an earlier template kept on this computer", tasks: "Tasks an earlier template kept on this computer", contracts: "Contracts an earlier template kept on this computer", compliance: "A register an earlier template kept on this computer" };
const RECORD_TOOLS = ["ingest_document", "propose_facts", "list_proposals", "get_proposal", "explain_facts", "search_documents", "list_documents", "define_record_type", "list_record_types", "create_record", "update_record", "move_record", "get_record", "query_records", "record_history", "evaluate_workflow", "list_evaluations", "get_evaluation"];
const COMMITMENT_TOOLS = ["propose_commitment", "bind_commitments", "whats_due", "complete_obligation", "get_commitment", "list_commitments"];
const WORKFLOW_TOOLS = ["send_workflows", "list_workflows", "start_workflow_run", "list_workflow_runs", "get_workflow_run", "list_claimable_workflow_steps", "claim_workflow_step", "complete_workflow_step", "fail_workflow_step", "release_workflow_step", "cancel_workflow_run"];
const GATE = "Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 14`. Under an earlier text call none of them and tell the owner that the instructions update turns this on";
const toolsNamedIn = (text) => [...new Set([...text.matchAll(/`([a-z]+_[a-z_]+)`/gu)].map(([, name]) => name))];
const instructions = readFileSync(join(repoRoot, "template", "INSTRUCTIONS.md"), "utf8");
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
  for (const topic of SERVICE_GUIDES) assert.doesNotMatch(guideText(topic), /`actor`|`idem_key`/u, `${topic} works through the service's tools, which take the actor from the credential and an idemKey`);
  assert.equal(ACTOR_MAX_CHARACTERS, 200);
  for (const part of ["1 to 200 Unicode characters", "no control characters or line breaks", "no leading or trailing whitespace", "Nothing is trimmed."]) {
    assert.ok(ACTOR_SENTENCE.includes(part) && ACTOR_RULE.includes(part), `the guides and the kit's E_INPUT_SCHEMA hint both say: ${part}`);
  }
  assert.ok(ACTOR_SENTENCE.includes("internal spaces allowed") && ACTOR_RULE.includes("Internal spaces are allowed."));
});

test("the records, tasks, contracts and compliance guides keep everything on the service: each is gated on the bot's own instructions, names only tools the instructions allow, defers to the tool's own schema, and names its module only to say that earlier data stays readable and nothing new goes there", () => {
  const allowed = toolsNamedIn(instructions);
  const named = new Set();
  for (const topic of SERVICE_GUIDES) {
    const guide = guideText(topic);
    assert.ok(guide.includes(GATE), `${topic} is gated on the bot's own instructions`);
    assert.ok(guide.includes("Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema."), `${topic} defers to the tool's own schema`);
    assert.ok(guide.includes("whose server is `https://ambitiousbots.com/api/mcp`"), `${topic} names the one server`);
    for (const tool of toolsNamedIn(guide).filter((name) => !["send_compliance_status"].includes(name) && /_/u.test(name) && [...RECORD_TOOLS, ...COMMITMENT_TOOLS, ...WORKFLOW_TOOLS].includes(name))) named.add(tool);
    for (const [, name] of guide.matchAll(/`([a-z]+_[a-z_]+)`/gu)) {
      if ([...RECORD_TOOLS, ...COMMITMENT_TOOLS, ...WORKFLOW_TOOLS, "send_compliance_status"].includes(name)) assert.ok(allowed.includes(name), `${topic} names the tool ${name}, which the instructions do not allow`);
    }
    const earlier = section(topic, EARLIER_SECTION[topic]);
    assert.ok(earlier.length > 0, `${topic} says what happens to what an earlier template kept on this computer`);
    assert.match(earlier, /^.*\n\nTemplates before 0\.5\.0 kept /u, topic);
    assert.match(earlier, /That data stays where it is and stays readable/u, topic);
    assert.match(earlier, /Nothing moves by itself\./u, topic);
    assert.match(earlier, /Add (?:nothing new|no new work) there, and never edit a module's database\./u, topic);
    const outside = guide.replace(earlier, "");
    assert.ok(!outside.includes(`\`${MODULE_OF[topic]}\``), `${topic} names ${MODULE_OF[topic]} only in that section: nothing else sends the bot to the module`);
    assert.doesNotMatch(outside, /\bbinary\b|--in\b|on stdin/u, `${topic} gives no module command line`);
    assert.match(guide, /keep nothing on this computer meanwhile/u, `${topic}: storage that is not ready is waited for, never replaced by a local file`);
  }
  assert.deepEqual([...named].sort(), [...RECORD_TOOLS, ...COMMITMENT_TOOLS, ...WORKFLOW_TOOLS].sort(), "between them the four guides name every record, commitment and workflow tool the instructions allow");
});

test("people confirm: the tasks, contracts and compliance guides say that a member decides on the records page and that no tool does", () => {
  for (const [topic, required] of Object.entries({
    tasks: ["A signed-in member of the owner's organization decides on the service's `/records` page. No tool does any of these:", "| `propose_commitment` | Activates it, or rejects it. Nothing is scheduled before that. |", "| `complete_obligation` | Accepts the work, or sends it back. Unless the commitment needs no acceptance, it does not count before that. |", "Never say a commitment is active or work is accepted unless `get_commitment`, `list_commitments` or `whats_due` shows it."],
    contracts: ["A signed-in member of the owner's organization confirms or rejects a proposal of facts, and activates or rejects a proposed commitment, on the service's `/records` page. No tool does either.", "Until then a proposed fact is not a fact and a proposed commitment schedules nothing.", "never say it was confirmed unless `get_proposal`, `list_proposals` or `explain_facts` shows it"],
    compliance: ["A signed-in member of the owner's organization does both; no tool does.", "A member accepts it on `/records` before it counts."],
  })) {
    for (const sentence of required) assert.ok(guideText(topic).includes(sentence), `the ${topic} guide says: ${sentence}`);
  }
  for (const topic of SERVICE_GUIDES) assert.doesNotMatch(guideText(topic), /\b(?:confirm_|activate_|accept_|waive_)[a-z_]+/u, `${topic} names no tool that confirms, activates, accepts or waives: there is none`);
});

test("the records guide says how a type name is spelled, beside the definition keys and the field kinds it already listed", () => {
  const guide = guideText("records");
  assert.ok(
    guide.includes("A type name is lower-case words joined by hyphens, for example `sales-deal`, not underscores. Field and stage names are lower-case words joined by underscores.\n"),
    "the naming rule is one line",
  );
  assert.ok(guide.includes("`idemKey` and `definition`: `type`, `version`, `fields`, `stages`, `initial`, `transitions`, `terminal`"));
  assert.ok(guide.includes("Field kinds are `string`, `text`, `int`, `decimal`, `money`, `date`, `datetime`, `bool`, `enum` and `ref`."));
  assert.ok(guide.includes("A refused move answers `E_TRANSITION` with the stages it could move to and the fields still missing; nothing is stored, so fill the fields with `update_record` and move again with a new `idemKey`."));
  assert.ok(guide.includes("`limit` defaults to 50, up to 100."));
  const skill = skillOnly("ambitious-records-for-bots");
  assert.doesNotMatch(skill, /`transitions`|`terminal`/u, "the records skill lists no definition key, so the naming rule lives in the guide alone");
  assert.match(skill, /guide records --json/u);
});

test("the compliance guide lays the register out on the service, gives one rule for where a control stands, and claims no compliance", () => {
  const guide = guideText("compliance");
  for (const required of [
    "It does not judge whether the business meets any law, standard or certification, and neither do you: report what is on record, never a compliance opinion.",
    "| A control | A record of the type `compliance-control` | `define_record_type` once, then `create_record` |",
    "| A control's regular proof | A commitment whose `subjectId` is the program document | `propose_commitment` |",
    "| Proof was collected for a control | The due occurrence reported done, with the evidence document | `whats_due`, `complete_obligation` |",
    "Take the first row that fits, top to bottom, and nothing else:",
    "| `red` | An occurrence is `overdue` |",
    "| `yellow` | An occurrence is `open` or `submitted`: proof is due, or reported and not yet accepted |",
    "| `green` | An occurrence is `satisfied` |",
    "Never decide a status from anything a tool did not return, and never state that a requirement is met: a status describes only what is on record.",
    "Ignore occurrences that are `waived`, except to say that they exist; superseded ones are not returned.",
    "when 100 came back, query again for `ref` greater than the last one, until fewer come back",
    "Every write except `send_compliance_status`, which has its `statusId`, needs an `idemKey`",
    "Call `send_compliance_status` only when this bot's instructions allow that tool, which the published texts do from `Instructions version: 12`, and only when the register above exists",
    "It carries no evidence, no document text and no secret.",
    "It is not a signature and does not prove who collected a piece of evidence; say so if asked.",
  ]) {
    assert.ok(guide.includes(required), `the compliance guide says: ${required}`);
  }
  const statuses = [...section("compliance", "Where a control stands").matchAll(/^\| `([a-z]+)` \| /gmu)].map(([, status]) => status);
  assert.deepEqual(statuses, ["unknown", "red", "yellow", "green", "unknown"], "the rule is ordered: what cannot be read first, then overdue, then due, then accepted, and unknown for anything else");
  assert.doesNotMatch(guide, /\b(?:is|are|stay|stays|become|becomes|makes? (?:you|it|them)) compliant\b|\bcertified\b|\bguarantee/iu, "the guide claims no compliance");
  const [definition] = jsonExamples("compliance");
  assert.deepEqual(Object.keys(definition), ["type", "version", "fields", "stages", "initial", "transitions", "terminal"]);
  assert.match(definition.type, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u, "the type name is spelled as the service requires");
  for (const name of [...Object.keys(definition.fields), ...definition.stages]) assert.match(name, /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u, name);
  assert.ok(definition.stages.includes(definition.initial) && definition.terminal.every((stage) => definition.stages.includes(stage)));
  for (const { from, to, requires = [] } of definition.transitions) {
    assert.ok(definition.stages.includes(from) && definition.stages.includes(to) && !definition.terminal.includes(from));
    for (const field of requires) assert.ok(Object.hasOwn(definition.fields, field), `the move to ${to} requires the declared field ${field}`);
  }
  assert.deepEqual([definition.fields.ref.unique, definition.fields.ref.kind], [true, "string"], "a unique field is of a kind the service lets be unique");
  const skill = skillOnly("ambitious-compliance-for-bots");
  assert.ok(skill.includes("report what is on record, never a compliance opinion"));
  assert.ok(skill.includes("A control's status comes only from the guide's rule over what the tools returned; otherwise it is `unknown`."));
  assert.doesNotMatch(skill, /\bred\b|\byellow\b|\bgreen\b/u, "the compliance skill does not describe the colors, so what a color means lives in the guide alone");
});

test("the compliance guide's one command prints a statusId and an asOf that the service's send_compliance_status schema accepts", () => {
  const [, command] = /```sh\nnode -e '(.+)'\n```/u.exec(section("compliance", "Send the status")) ?? [];
  assert.ok(command !== undefined, "the guide shows the command");
  const first = JSON.parse(execFileSync(process.execPath, ["-e", command], { encoding: "utf8" }));
  const second = JSON.parse(execFileSync(process.execPath, ["-e", command], { encoding: "utf8" }));
  for (const { statusId, asOf } of [first, second]) {
    assert.match(statusId, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u, "a version 7 UUID in lower case");
    assert.match(asOf, /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]Z$/u, "an instant in UTC");
    const stamped = Number.parseInt(statusId.replaceAll("-", "").slice(0, 12), 16);
    assert.equal(Math.floor(stamped / 1000) * 1000, Date.parse(asOf), "the first 48 bits are the time in milliseconds, the same instant asOf gives to the second");
  }
  assert.notEqual(first.statusId, second.statusId, "each run makes a new id");
});

test("the tasks guide says what a commitment's rule is, which states an occurrence has, how a step is claimed, and how work is shown in a Page", () => {
  const guide = guideText("tasks");
  for (const required of [
    "A `rule` is one of four kinds. `recurring`: every `month`, `quarter` or `year` from a `start` fact",
    "`before_date`: `days` before the date in a fact. `on_date`: on the date in a fact, opening `leadDays` before. `after_signal`: `days` after the rule's `signal` arrives.",
    "The service, not the bot, works out every date.",
    "It is `scheduled`, then `open` when its time comes; `submitted` once the bot reported it done; `satisfied` once a member accepted it; `overdue` when open work passes its date; `waived` or `superseded` when it no longer applies.",
    "send the `rev` you read with `complete_obligation`, and on `E_CONFLICT` read it again before deciding",
    "That list and `list_commitments` are the truth the service holds. Do not keep a second list, and never work out a count, a ranking or a date yourself",
    "To do a step: read the run with `get_workflow_run` for its current `version`, claim the step, and only then do the work.",
    "Never claim a step for a person: the service answers `E_STEP_NOT_CLAIMABLE`, and `list_claimable_workflow_steps` does not list one.",
    "`yields` lists entries such as `{\"signal\": \"report.accepted\"}`, each with an optional `on` of `satisfied` or `overdue` that says when it is sent. `needs` lists signal names; only an `after_signal` rule takes `needs`, and its `signal` must be among them.",
    "only `open` or `overdue` work can be reported done, and `complete_obligation` on anything else answers `E_TRANSITION`",
    "The module still supplies the task rows a schedule plan places, as the `scheduling` guide says; a plan never changes what the service holds.",
  ]) {
    assert.ok(guide.includes(required), `the tasks guide says: ${required}`);
  }
  const page = section("tasks", "Present work as a Page");
  for (const required of ["This is the layout the `ambitious-tasks-page` skill renders.", "Do not rank or re-sort them.", 'Add a section "Waiting for a person"', "Never show either as active or done.", "A Page edit alone never changes what the service holds."]) {
    assert.ok(page.includes(required), `the Page layout says: ${required}`);
  }
  assert.deepEqual(jsonExamples("tasks"), [], "the tasks guide holds no module command example");
  for (const topic of ["records", "tasks", "contracts"]) assert.ok(guideText(topic).includes("`E_UNAUTHENTICATED` means the connection is not signed in, and `E_FORBIDDEN` means its credential may not use this tool for an organization"), `${topic} tells the two refusals apart`);
  for (const [topic, refused] of [["records", "A record whose fields are over 8,192 bytes is refused as `E_INVALID_PAYLOAD`."], ["tasks", "is refused as `E_INVALID_PAYLOAD`. The service schedules at most 24 occurrences of a commitment, up to 400 days ahead."], ["contracts", "A fact whose value is over 2,048 bytes is refused as `E_INVALID_PAYLOAD`."], ["compliance", "a larger one is refused as `E_INVALID_PAYLOAD`"]]) assert.ok(guideText(topic).includes(refused), `${topic} names the refusal a too-large input gets, which is not E_LIMIT`);
  assert.match(skillOnly("ambitious-tasks-page"), /guide tasks --json/u);
});

test("the contracts guide keeps the text, proposes facts with the span they were read from, and handles an amendment as its own document", () => {
  const guide = guideText("contracts");
  for (const required of [
    "The same text is kept once: sending it again answers with the first copy and `duplicate` true.",
    "with the `span` of text it was read from: the `start` and `end` character offsets in the kept text",
    "Write a date as `\"YYYY-MM-DD\"` and a number of days as a whole number, so a rule can use them.",
    "Propose only what the text says. Never paraphrase a value to make it fit, and leave out what the text does not state: an unknown is no fact, never a guess.",
    "`list_proposals` shows each one's status: `open`, `applied`, `rejected` or `expired`.",
    "`ingest_document` with `kind` `amendment` and `amends` set to the contract's `documentId`",
    "scheduled and open work whose dates changed is replaced, and finished work is untouched",
    "The service works out every date from confirmed facts. Never calculate one yourself.",
    "never ingest a text that holds a credential",
  ]) {
    assert.ok(guide.includes(required), `the contracts guide says: ${required}`);
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
  for (const topic of [...ACTOR_GUIDES, ...SERVICE_GUIDES]) assert.doesNotMatch(guideText(topic), NOT_GENERIC, `${topic} names no person, bot or customer`);
  assert.equal(readFileSync(join(repoRoot, "NOTICE"), "utf8").split("\n")[1], "Copyright 2026 Ambitious Corporation");
});
