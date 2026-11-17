import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { isRecord } from "../src/domain/json.ts";
import { describeSchemaProblems, schemaProblems } from "../src/domain/json-schema.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const schemas = join(root, "schemas", "interchange");
const examples = join(root, "examples", "interchange");

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const jsonFiles = (directory: string): readonly string[] =>
  readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort();

const names = jsonFiles(schemas).map((file) => file.replace(/\.json$/, ""));

test("every interchange schema has examples, and every example set has a schema", () => {
  assert.deepEqual(readdirSync(examples).sort(), names);
  assert.deepEqual(names, ["calendar-holds.v1", "constraint-model.v1", "constraint-solution.v1", "schedule-plan.v1", "tasks-snapshot.v1"]);
});

for (const name of names) {
  const schema = readJson(join(schemas, `${name}.json`));

  test(`${name}: the schema names itself in its schema field`, () => {
    assert.equal(isRecord(schema) && isRecord(schema.properties) && isRecord(schema.properties.schema) && schema.properties.schema.const, name);
  });

  for (const file of jsonFiles(join(examples, name, "valid"))) {
    test(`${name}: valid/${file} is accepted`, () => {
      assert.equal(describeSchemaProblems(schemaProblems(schema, readJson(join(examples, name, "valid", file)))), "");
    });
  }

  const expected = readJson(join(examples, name, "expected-failures.json"));
  const invalid = jsonFiles(join(examples, name, "invalid"));

  test(`${name}: every invalid example has an expected failure, and the reverse`, () => {
    assert.deepEqual(isRecord(expected) ? Object.keys(expected).sort() : [], invalid);
    assert.ok(invalid.length >= 2);
  });

  for (const file of invalid) {
    test(`${name}: invalid/${file} is refused for the expected reason`, () => {
      const problems = schemaProblems(schema, readJson(join(examples, name, "invalid", file)));
      const wanted = isRecord(expected) ? expected[file] : undefined;
      assert.ok(isRecord(wanted));
      assert.ok(
        problems.some(({ pointer, keyword }) => pointer === wanted.pointer && keyword === wanted.keyword),
        describeSchemaProblems(problems),
      );
    });
  }
}

test("a schema keyword the checker does not know is an error, not a pass", () => {
  assert.throws(() => schemaProblems({ oneOf: [] }, 1), /not supported/);
  assert.throws(() => schemaProblems({ $ref: "https://example.com/schema" }, 1), /not a local/);
});
