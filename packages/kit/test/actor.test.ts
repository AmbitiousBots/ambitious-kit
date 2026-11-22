import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { ACTOR_RULE, actorProblem, parseActor } from "../src/domain/actor.ts";
import { Failure } from "../src/domain/failure.ts";
import { isRecord } from "../src/domain/json.ts";

const cases: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "actor-cases.json"), "utf8"));

const actorOf = (entry: Readonly<Record<string, unknown>>): unknown =>
  typeof entry.repeat === "string" && typeof entry.times === "number" ? entry.repeat.repeat(entry.times) : entry.actor;

for (const entry of Array.isArray(cases) ? cases : []) {
  if (!isRecord(entry) || typeof entry.title !== "string") throw new Error("An actor case must have a title.");
  const { title, problem } = entry;
  test(`actor: ${title} is ${problem === null ? "accepted unchanged" : "refused"}`, () => {
    const actor = actorOf(entry);
    assert.equal(actorProblem(actor), problem);
    if (problem === null) {
      assert.equal(parseActor(actor), actor);
      return;
    }
    assert.throws(
      () => parseActor(actor),
      (error: unknown) => {
        assert.ok(error instanceof Failure);
        assert.deepEqual(error.errors, [
          { code: "E_INPUT_SCHEMA", message: `The input field "actor" ${String(problem)}.`, hint: `Send an actor that fits this rule: ${ACTOR_RULE}` },
        ]);
        return true;
      },
    );
  });
}

test("the actor cases shared with the Python kit cover lone surrogates and astral characters at the length limit", () => {
  const text = JSON.stringify(cases);
  for (const needed of ["\\ud800", "\\udc00", '"times":200', '"times":201', "😀"]) assert.ok(text.includes(needed), needed);
});

test("the actor rule in the hint states the length, the refused characters, the edges and that nothing is trimmed", () => {
  assert.equal(
    ACTOR_RULE,
    "actor is 1 to 200 Unicode characters, with no control characters or line breaks and no leading or trailing whitespace. Internal spaces are allowed. Nothing is trimmed.",
  );
});
