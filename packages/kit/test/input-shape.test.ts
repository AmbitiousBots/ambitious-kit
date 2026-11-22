import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { FIELD_TYPES, listedShape, shapeProblems } from "../src/domain/input-shape.ts";
import { isRecord } from "../src/domain/json.ts";

const cases: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "input-shape-cases.json"), "utf8"));

test("the shape cases shared with the Python kit cover a null example, an unknown type and a type that is not a string", () => {
  assert.ok(Array.isArray(cases) && cases.length >= 16);
  const text = JSON.stringify(cases);
  for (const needed of ["is null, but its type is", "has the unknown type", "has a type that is not a string"]) assert.ok(text.includes(needed), needed);
});

for (const entry of Array.isArray(cases) ? cases : []) {
  if (!isRecord(entry) || typeof entry.title !== "string" || typeof entry.takesInput !== "boolean") throw new Error("A shape case must have a title and takesInput.");
  const { title, takesInput, shape, problems } = entry;
  test(`input shape: ${title}`, () => {
    assert.deepEqual(shapeProblems("add", takesInput, shape), problems);
  });
}

test("the allowed field types are the six JSON kinds a field can be", () => {
  assert.deepEqual(FIELD_TYPES, ["string", "number", "integer", "boolean", "object", "array"]);
});

test("a shape is listed as its fields and, when one is given, its example", () => {
  const fields = [
    { name: "title", type: "string", required: true },
    { name: "actor", type: "string", required: false },
  ] as const;
  assert.deepEqual(listedShape({ fields }), { fields });
  assert.deepEqual(listedShape({ fields, example: { title: "Ship the release" } }), { fields, example: { title: "Ship the release" } });
});
