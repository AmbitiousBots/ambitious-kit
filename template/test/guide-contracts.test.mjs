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
const FROM_0_5_0 = /\nTemplate 0\.5\.0 kept [^\n]* on the service through earlier tools of the connection, which this bot's instructions no longer name\. Call none of them\. The tools above do not read what was kept that way\. /u;
const MODULE_OF = { records: "ambitious-records", tasks: "ambitious-tasks", contracts: "ambitious-contracts", compliance: "ambitious-compliance" };
const EARLIER_SECTION = { records: "Records an earlier template kept on this computer", tasks: "Tasks an earlier template kept on this computer", contracts: "Contracts an earlier template kept on this computer", compliance: "A register an earlier template kept on this computer" };
const FACT_TOOLS = ["add_document", "get_document", "upsert_facts", "list_facts", "define_view", "query_view"];
const RECIPE_TOOLS = ["define_recipe", "compile_recipe", "list_definitions", "plan_recipe", "run_recipe", "list_schedules", "get_run", "emit_signal", "list_claimable_steps", "claim_step", "complete_step", "fail_step"];
const WORKFLOW_TOOLS = ["send_workflows", "list_workflows", "start_workflow_run", "list_workflow_runs", "get_workflow_run", "list_claimable_workflow_steps", "claim_workflow_step", "complete_workflow_step", "fail_workflow_step", "release_workflow_step", "cancel_workflow_run"];
const SERVICE_TOOLS = [...FACT_TOOLS, ...RECIPE_TOOLS, ...WORKFLOW_TOOLS];
const RETIRED_TOOLS = ["ingest_document", "propose_facts", "list_proposals", "get_proposal", "explain_facts", "search_documents", "list_documents", "define_record_type", "list_record_types", "create_record", "update_record", "move_record", "get_record", "query_records", "record_history", "evaluate_workflow", "list_evaluations", "get_evaluation", "propose_commitment", "bind_commitments", "whats_due", "complete_obligation", "get_commitment", "list_commitments"];
const SERVICE_SKILLS = ["ambitious-records-for-bots", "ambitious-tasks-for-bots", "ambitious-tasks-page", "ambitious-contracts-for-bots", "ambitious-compliance-for-bots"];
const GATE = "Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 15`. Under an earlier text call none of them and tell the owner that the instructions update turns this on";
const SUBJECT = /^[a-z][a-z0-9_]{0,31}$/u;
const FACT_KEY = /^[a-z][a-z0-9_]{0,31}(?:\.[a-z][a-z0-9_]{0,31}){0,7}$/u;
const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const STEP_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;
const STEP_KINDS = ["eval", "ai", "tool", "human", "wait", "return", "recipe"];
const ACTION = /^(?:documents\.ingest|facts\.upsert|views\.query|signals\.emit|bot\.[a-z][a-z0-9_]{0,63})$/u;
const REVIEW_KEY = /(?:^|\.)verified(?:_by|_at)?$/u;
const factPathsIn = (value) => [...JSON.stringify(value).matchAll(/"(?:\$|field)":"facts\.([a-z0-9_.]+)"/gu)].map(([, key]) => key);
const checkRecipe = (recipe, where) => {
  assert.deepEqual([recipe.dslVersion, recipe.kind], [1, "recipe"], where);
  assert.match(recipe.id, KEBAB, where);
  assert.match(recipe.subject, SUBJECT, `${where}: a recipe that reads facts names its subject kind`);
  assert.ok(recipe.steps.length <= 32 && recipe.triggers.length >= 1, where);
  const ids = recipe.steps.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, `${where}: each step id once`);
  for (const step of recipe.steps) {
    assert.match(step.id, STEP_ID, `${where}: ${step.id}`);
    assert.ok(STEP_KINDS.includes(step.kind), `${where}: ${step.id} is one of the seven step kinds`);
    if (step.kind === "tool") assert.match(step.action, ACTION, `${where}: ${step.id} runs a record action or hands bot work to a bot`);
    if (step.kind === "human") assert.ok((step.choices === undefined) !== (step.verifies === undefined), `${where}: ${step.id} declares exactly one of choices or verifies`);
    if (step.kind === "wait") assert.equal(["for", "until", "signal"].filter((mode) => step[mode] !== undefined).length, 1, `${where}: ${step.id} waits in exactly one way`);
    for (const target of [step.next, step.default?.next, ...(step.cases ?? []).map(({ next }) => next)]) if (target !== undefined) assert.ok(ids.includes(target), `${where}: ${step.id} goes to a step that exists`);
    for (const key of step.from ?? []) assert.match(key, FACT_KEY, `${where}: ${step.id} lists a fact key`);
  }
  assert.ok(recipe.steps.some(({ kind }) => kind === "return"), `${where}: every path ends in a return`);
  assert.equal(recipe.steps.at(-1).kind, "return", where);
  for (const key of factPathsIn(recipe)) assert.match(key.replace(/\.verified(?:_by|_at)?$/u, ""), FACT_KEY, `${where}: reads the fact ${key}`);
  assert.doesNotMatch(JSON.stringify(recipe), /facts\.verify|facts\.write|facts\.propose|"confirms"/u, `${where}: no action marks a fact verified, and facts are written with facts.upsert`);
};
const checkView = (view, where) => {
  assert.deepEqual([view.dslVersion, view.kind, view.from.source], [1, "view", "facts"], where);
  assert.match(view.id, KEBAB, where);
  assert.match(view.from.subject, SUBJECT, where);
  assert.ok(view.limit >= 1 && view.limit <= 200, `${where}: a view returns at most 200 rows`);
  const columns = Array.isArray(view.select) ? view.select.map((path) => path.replace(/^facts\./u, "").replaceAll(".", "_")) : Object.keys(view.select);
  const paths = Array.isArray(view.select) ? view.select : Object.values(view.select).map(({ field }) => field);
  for (const path of paths) assert.match(path, /^(?:subject|kind|now|facts\.[a-z0-9_.]+|compute\.[a-z_]+)$/u, `${where}: a view over facts reads subject, kind, now, a fact or a compute field`);
  for (const { field } of typeof view.orderBy === "string" ? [{ field: view.orderBy.replace(/^facts\./u, "").replaceAll(".", "_") }] : view.orderBy) assert.ok(columns.includes(field), `${where}: orders by the selected column ${field}`);
  for (const path of paths.filter((candidate) => candidate.startsWith("compute."))) assert.ok(Object.hasOwn(view.compute ?? {}, path.slice(8)), `${where}: ${path} is declared`);
};
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
    for (const tool of toolsNamedIn(guide).filter((name) => SERVICE_TOOLS.includes(name))) named.add(tool);
    for (const tool of RETIRED_TOOLS) assert.ok(!guide.includes(tool), `${topic} names ${tool}, a tool of the earlier stores that the service is retiring`);
    for (const [, name] of guide.matchAll(/`([a-z]+_[a-z_]+)`/gu)) {
      if ([...SERVICE_TOOLS, "send_compliance_status"].includes(name)) assert.ok(allowed.includes(name), `${topic} names the tool ${name}, which the instructions do not allow`);
    }
    const earlier = section(topic, EARLIER_SECTION[topic]);
    assert.ok(earlier.length > 0, `${topic} says what happens to what an earlier template kept on this computer`);
    assert.match(earlier, /^.*\n\nTemplates before 0\.5\.0 kept /u, topic);
    assert.match(earlier, /That data stays where it is and stays readable/u, topic);
    assert.match(earlier, /Nothing moves by itself\./u, topic);
    assert.match(earlier, /Add (?:nothing new|no new work) there, and never edit a module's database\./u, topic);
    assert.match(earlier, FROM_0_5_0, `${topic} says that what template 0.5.0 kept through the earlier tools is not read by the present ones, and that none of them is called`);
    const outside = guide.replace(earlier, "");
    assert.ok(!outside.includes(`\`${MODULE_OF[topic]}\``), `${topic} names ${MODULE_OF[topic]} only in that section: nothing else sends the bot to the module`);
    assert.doesNotMatch(outside, /\bbinary\b|--in\b|on stdin/u, `${topic} gives no module command line`);
    assert.match(guide, /keep nothing on this computer meanwhile/u, `${topic}: storage that is not ready is waited for, never replaced by a local file`);
  }
  assert.deepEqual([...named].sort(), [...SERVICE_TOOLS].sort(), "between them the four guides name every document, fact, view, recipe and workflow tool the instructions allow");
  for (const tool of RETIRED_TOOLS) assert.ok(!instructions.includes(tool), `the instructions name ${tool}, a tool of the earlier stores`);
});

test("facts are usable as soon as they are written, and only a person verifies, activates and answers: every service guide and skill says so, none tells a bot to wait for a person before a fact counts, and none names a tool that does a person's part", () => {
  for (const [topic, required] of Object.entries({
    records: ["A fact is usable as soon as it is written: every view, recipe and schedule reads it at once, and nothing waits for a person.", "Every fact is written unverified. A signed-in member of the owner's organization may mark a fact verified on the service's `/records` page, and the service records who did and when. No tool does that, and a bot never does.", "A review is optional: do not wait for one, and do not ask for one unless the owner wants the facts reviewed.", "Never say a fact is verified unless `list_facts` shows it."],
    tasks: ["A fact is usable as soon as it is written, and so is work kept as facts: nothing waits for a person. A signed-in member of the owner's organization does these on the service's `/records` page, and no tool does any of them:", "| Marks a fact verified | An optional review, recorded on the fact with who and when. Do not wait for it. |", "| Activates a recipe whose `activation` is `person` | Until then the recipe is a draft and starts no run. |", "| Answers a `human` step | The run waits at that step. Tell the owner which run waits and for what. |", "Never say a fact is verified, a recipe is active or a step was answered unless `list_facts`, `list_definitions` or `get_run` shows it.", "Never claim or answer a `human` step: the service refuses with `E_FORBIDDEN`, and `list_claimable_steps` does not list one."],
    contracts: ["A fact is usable as soon as it is written. Nothing waits for a person: a view, a schedule and `compile_recipe` read it at once.", "That review is optional, no tool does it, and a bot never does. Never say a fact is verified unless `list_facts` shows it.", "A recipe compiled from a contract is a draft. It runs only after a signed-in member activates it on `/records`. No tool activates it.", "never say it is active unless `list_definitions` lists it"],
    compliance: ["The facts are in use as soon as they are written; a member may review them on the service's `/records` page, and no tool does that.", "A signed-in member of the owner's organization then accepts or rejects the proof on `/records`. No tool does, and it does not count before that: never say proof was accepted unless the view shows `accepted`."],
  })) {
    for (const sentence of required) assert.ok(guideText(topic).includes(sentence), `the ${topic} guide says: ${sentence}`);
  }
  for (const topic of SERVICE_GUIDES) {
    const guide = guideText(topic);
    assert.doesNotMatch(guide, /\b(?:verify_|confirm_|activate_|accept_|waive_|resolve_)[a-z_]+|facts\.verify/u, `${topic} names no tool or action that verifies, activates or answers for a person: there is none`);
    assert.doesNotMatch(guide, /\b[Yy]ou propose\b|\bpropos(?:e|es|ed|al|als|ing)\b|\bpeople confirm\b|\bconfirm(?:s|ed|ing)?\b|until (?:a|it is|they are) (?:member )?(?:confirm|verif)/u, `${topic} holds no propose-then-confirm rule: a fact counts when it is written`);
    assert.doesNotMatch(guide, /"verified":\s*true|`verified` (?:as|to) true/u, `${topic} never has a bot write a fact as verified`);
  }
  for (const name of SERVICE_SKILLS) {
    const skill = skillOnly(name);
    assert.doesNotMatch(skill, /\b[Yy]ou propose\b|\bpropos(?:e|es|ed|al|als|ing)\b|\bconfirm(?:s|ed|ing)?\b/u, `${name} holds no propose-then-confirm rule`);
    for (const tool of RETIRED_TOOLS) assert.ok(!skill.includes(tool), `${name} names ${tool}, a tool of the earlier stores`);
    if (name !== "ambitious-tasks-page") assert.ok(skill.includes("A fact is usable once written. Only a signed-in member of the owner's organization marks "), `${name} states in its hard rules that a fact is usable once written and that only a person marks one verified`);
    assert.match(skill, /on the service's `\/records` page/u, name);
  }
});

test("the records guide keeps a record as a subject and its facts, says how subjects, keys and types are spelled, and shows a view the service's schema accepts", () => {
  const guide = guideText("records");
  for (const required of [
    "A subject is anything the owner keeps a record of, written as its kind, a colon and its id, such as `lead:42`.",
    "A key is one to eight lower-case segments joined by dots, each starting with a letter and at most 32 characters. A key may not end in `verified`, `verified_by` or `verified_at`: those words read a fact's review.",
    "A type is `text`, `int`, `number`, `bool`, `date`, `datetime` or `json`.",
    "So give `type` `date` with a date written `\"YYYY-MM-DD\"`",
    "Writing an equal value, with the same type and source, changes nothing. Writing a different one replaces the current fact, and the service keeps the old value as history.",
    "A count limit that was reached answers `E_CONFLICT` with a message that names it",
    "The answer lists each fact with its `outcome`, `written` or `unchanged`.",
    "A view returns 50 rows unless `limit` says otherwise, up to 200, and no sign that more exist",
    "Present counts and totals only as a tool returned them; never add up rows yourself.",
    "One write holds at most 50 facts, each key once, and a value is at most 4,096 bytes.",
  ]) {
    assert.ok(guide.includes(required), `the records guide says: ${required}`);
  }
  const [, subject] = /such as `([a-z]+:[0-9]+)`/u.exec(guide) ?? [];
  assert.match(subject, /^[a-z][a-z0-9_]{0,31}:[A-Za-z0-9][A-Za-z0-9._-]*$/u, "the example subject is spelled as the service requires");
  const [view] = jsonExamples("records");
  assert.equal(jsonExamples("records").length, 1);
  checkView(view, "the records view");
  const skill = skillOnly("ambitious-records-for-bots");
  assert.doesNotMatch(skill, /`orderBy`|`dslVersion`/u, "the records skill lists no definition key, so the view format lives in the guide alone");
  assert.match(skill, /guide records --json/u);
});

test("the compliance guide lays the register out on the service as facts, one recipe and one view, gives one rule for where a control stands, and claims no compliance", () => {
  const guide = guideText("compliance");
  for (const required of [
    "It does not judge whether the business meets any law, standard or certification, and neither do you: report what is on record, never a compliance opinion.",
    "| A control | A subject of the kind `control`, with the facts `ref`, `title`, `owner`, `frequency`, `start` and `due_days`, each citing the program document | `upsert_facts` |",
    "| A control's regular proof | A run of the recipe `control-proof`, which the service starts for each control on its schedule | `define_recipe`, once |",
    "| Proof was collected for a control | The run's `collect` step completed with the evidence document | `list_claimable_steps`, `claim_step`, `complete_step` |",
    "For each row take the first line that fits, top to bottom, and nothing else:",
    "| `red` | `overdue` is true and `state` is `due`, `submitted` or `rejected` |",
    "| `yellow` | `state` is `due`, `submitted` or `rejected`: proof is due, or reported and not yet accepted |",
    "| `green` | `state` is `accepted` |",
    "Never decide a status from anything a tool did not return, never work out `overdue` yourself, and never state that a requirement is met: a status describes only what is on record.",
    "The view returns at most 200 rows and no sign that more exist: when 200 came back, say that the list may be cut off.",
    "The status is the one exception: it carries its `statusId` instead, and takes no `idemKey`.",
    "Call `send_compliance_status` only when this bot's instructions allow that tool, which the published texts do from `Instructions version: 12`, and only when the register above exists",
    "It carries no evidence, no document text and no secret.",
    "It is not a signature and does not prove who collected a piece of evidence; say so if asked.",
    "a larger one is refused as `E_INVALID_PAYLOAD`",
  ]) {
    assert.ok(guide.includes(required), `the compliance guide says: ${required}`);
  }
  const statuses = [...section("compliance", "Where a control stands").matchAll(/^\| `([a-z]+)` \| /gmu)].map(([, status]) => status);
  assert.deepEqual(statuses, ["unknown", "red", "yellow", "green", "unknown"], "the rule is ordered: what cannot be read first, then overdue, then due, then accepted, and unknown for anything else");
  assert.doesNotMatch(guide, /\b(?:is|are|stay|stays|become|becomes|makes? (?:you|it|them)) compliant\b|\bcertified\b|\bguarantee/iu, "the guide claims no compliance");
  const [recipe, view] = jsonExamples("compliance");
  assert.equal(jsonExamples("compliance").length, 2);
  checkRecipe(recipe, "the control-proof recipe");
  assert.deepEqual([recipe.id, recipe.subject, recipe.activation], ["control-proof", "control", "auto"]);
  assert.deepEqual(recipe.triggers, [{ kind: "schedule", every: { $: "facts.frequency" }, start: { $: "facts.start" } }], "the service starts a run for each control every frequency from start");
  const accept = recipe.steps.find(({ kind }) => kind === "human");
  assert.deepEqual(accept.choices, ["accepted", "rejected"], "a person accepts or rejects the proof");
  assert.equal(recipe.steps.findIndex(({ id }) => id === "collect") < recipe.steps.indexOf(accept), true, "the bot's step comes before the person's");
  const written = recipe.steps.filter(({ action }) => action === "facts.upsert").flatMap(({ input }) => input.facts.map(({ key }) => key));
  assert.deepEqual([...new Set(written)].sort(), ["proof.document", "proof.due_at", "proof.state"]);
  for (const key of written) assert.doesNotMatch(key, REVIEW_KEY, "the recipe writes no review field");
  const states = recipe.steps.filter(({ action }) => action === "facts.upsert").flatMap(({ input }) => input.facts.filter(({ key, value }) => key === "proof.state" && typeof value === "string").map(({ value }) => value));
  const ruled = [...section("compliance", "Where a control stands").matchAll(/`state` is ((?:`[a-z]+`(?:, | or )?)+)/gu)].flatMap(([, list]) => [...list.matchAll(/`([a-z]+)`/gu)].map(([, state]) => state)).filter((state) => state !== "null");
  assert.deepEqual([...new Set(ruled)].sort(), [...new Set([...states, ...accept.choices])].sort(), "the status rule covers exactly the states the recipe writes");
  checkView(view, "the control-status view");
  assert.deepEqual([view.id, view.from.subject, Object.keys(view.select)], ["control-status", "control", ["ref", "title", "state", "due_at", "overdue"]]);
  assert.deepEqual(view.compute.overdue, { lt: [{ diffDays: [{ $: "now" }, { $: "facts.proof.due_at" }] }, 0] }, "the service, not the bot, works out whether proof is overdue");
  for (const fact of ["ref", "title", "frequency", "start", "due_days"]) assert.ok(factPathsIn([recipe, view]).includes(fact), `the recipe or the view reads the control's fact ${fact}`);
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

test("the tasks guide keeps work as facts with a view of what is due, lists the recipe tools and the seven step kinds, says how a step is claimed, and shows how work is presented in a Page", () => {
  const guide = guideText("tasks");
  for (const required of [
    "That view is the truth the service holds. Do not keep a second list, and never work out a count, a ranking or a date yourself",
    "A recipe is a list of steps, and each step's `kind` is one of seven.",
    "`tool` runs an action: `documents.ingest`, `facts.upsert`, `views.query` or `signals.emit` on the service, or a name starting with `bot.` for work a bot claims and does.",
    "`human` waits for a person, with `choices`, or with `verifies` naming the step whose facts the person reviews.",
    "A recipe starts by its `triggers`: `manual`; `event`, one of `document.ingested`, `fact.written`, `fact.verified` or `subject.created`; `schedule`, with `every` or `at`; or `signal`.",
    "The service, not the bot, works out every date and keeps every timer",
    "with `person`, and always when compiled, it is a draft until a member activates it.",
    "No tool lists every draft or every run, so say that the service's `/records` page holds the full list and that both are decided there.",
    "`E_FORBIDDEN` from `complete_step` or `fail_step` means this bot has not claimed the step: claim it first.",
    "call `run_recipe` again with the same `triggerKey`",
    "To do a step: claim it, and only then do the work.",
    "A claim lasts 60 seconds unless `leaseMs` says otherwise, up to 900,000",
    "A signal name is two lower-case words joined by a dot, such as `report.accepted`, and may not start with `fact`, `document` or `subject`.",
    "To do a step: read the run with `get_workflow_run` for its current `version`, claim the step, and only then do the work.",
    "Never claim a step for a person: the service answers `E_STEP_NOT_CLAIMABLE`, and `list_claimable_workflow_steps` does not list one.",
    "A recipe has at most 32 steps and a definition is at most 64 KB",
    "The module still supplies the task rows a schedule plan places, as the `scheduling` guide says; a plan never changes what the service holds.",
  ]) {
    assert.ok(guide.includes(required), `the tasks guide says: ${required}`);
  }
  for (const kind of STEP_KINDS) assert.ok(guide.includes(`\`${kind}\` `), `the tasks guide describes the step kind ${kind}`);
  assert.doesNotMatch(guide, /fact\.confirmed|`confirms`/u, "the guide names the events and step fields the service has now");
  const page = section("tasks", "Present work as a Page");
  for (const required of ["This is the layout the `ambitious-tasks-page` skill renders.", "Do not rank or re-sort them.", 'Add a section "Waiting for a person"', "Never show either as active or done.", "A Page edit alone never changes what the service holds."]) {
    assert.ok(page.includes(required), `the Page layout says: ${required}`);
  }
  const [view] = jsonExamples("tasks");
  assert.equal(jsonExamples("tasks").length, 1, "the tasks guide holds one view and no module command example");
  checkView(view, "the due-soon view");
  assert.equal(view.id, "due-soon");
  assert.ok(page.includes(`\`${view.id}\` when they did not say`), "the Page reads the view the guide defines");
  assert.ok(JSON.stringify(view.where).includes('"diffDays":[{"$":"now"},{"$":"facts.due_on"}]'), "the service compares each due date with now");
  for (const topic of ["records", "tasks", "contracts"]) assert.ok(guideText(topic).includes("`E_UNAUTHENTICATED` means the connection is not signed in, and `E_FORBIDDEN` means its credential may not use this tool for an organization".replace("` means its", topic === "tasks" ? "` from any other tool means its" : "` means its")), `${topic} tells the two refusals apart`);
  for (const topic of ["records", "tasks", "contracts", "compliance"]) assert.ok(guideText(topic).includes("`E_CONFLICT` with a message about the key means it was already used for a different request"), `${topic} says what a reused key answers`);
  assert.match(skillOnly("ambitious-tasks-page"), /guide tasks --json/u);
});

test("the contracts guide keeps the text by its hash, writes facts with the span they were read from, compiles what the contract obliges into a draft a person activates, and handles an amendment as a new version", () => {
  const guide = guideText("contracts");
  for (const required of [
    "The answer holds the document's `id`, which is `doc:sha256:` followed by the hash of the text. The same text is kept once: sending it again answers with the same `id` and `duplicate` true.",
    "`doc` is the document's `id`, never the series name, and `span` is the start and the end of the supporting text, counted in characters from 0, with the end not included",
    "Write a date as `\"YYYY-MM-DD\"` with `type` `date`, and a number of days as a whole number, so a recipe can use them.",
    "Write only what the text says. Never paraphrase a value to make it fit, and leave out what the text does not state: an unknown is no fact, never a guess.",
    "keeps a step that lists keys in `from` only when the subject has every one of them and none is false",
    "No model is called, and the same facts and template give the same draft.",
    "The service sets the draft's `version`, `activation`, `source` and the one subject it runs on.",
    "`add_document` with the same `series` returns a new `id`, and the earlier version stays readable under its own `id`",
    "A changed result is the next version of the draft, which a member activates; a run that already started keeps the version it started on and is not stopped.",
    "A new version starts its own run, also when its date is the same or has passed",
    "The service works out every date from the facts. Never calculate one yourself.",
    "never keep a text that holds a credential",
  ]) {
    assert.ok(guide.includes(required), `the contracts guide says: ${required}`);
  }
  const [template] = jsonExamples("contracts");
  assert.equal(jsonExamples("contracts").length, 1);
  checkRecipe(template, "the contract template");
  for (const set of ["activation", "source", "subjectId"]) assert.ok(!Object.hasOwn(template, set), `the template leaves ${set} to the service, which makes every compiled recipe a draft for a person`);
  const optional = template.steps.filter(({ from }) => from !== undefined);
  assert.ok(optional.length >= 2 && template.steps.some(({ kind, from }) => kind === "return" && from === undefined), "steps that depend on a clause list it in from, and the return is always kept");
  for (const step of optional) for (const key of factPathsIn(step)) assert.ok(step.from.includes(key) || factPathsIn(template.triggers).includes(key), `${step.id} reads ${key}, so it lists it in from or the trigger needs it`);
  assert.ok(template.steps.some(({ kind, until }) => kind === "wait" && until !== undefined) && template.steps.some(({ action }) => action?.startsWith("bot.")) && template.steps.some(({ kind }) => kind === "human"), "the template shows a deadline, bot work and a person's decision");
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
