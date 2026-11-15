import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(root, "schemas", "envelope.v1.json");
const validDir = join(root, "examples", "envelopes", "valid");
const invalidDir = join(root, "examples", "envelopes", "invalid");
const expectedFailuresPath = join(root, "examples", "envelopes", "expected-failures.json");
const contractPath = join(root, "MODULE_CONTRACT.md");

const ANNOTATIONS = new Set(["$schema", "title", "description", "$defs", "then", "else"]);

const typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
};

const isRecord = (value) => typeOf(value) === "object";

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const fail = (pointer, keyword, message) => [{ pointer, keyword, message }];

const resolveRef = (ref, rootSchema) => {
  if (!ref.startsWith("#/")) throw new Error(`Unsupported $ref "${ref}": only local "#/..." references are checked`);
  return ref
    .slice(2)
    .split("/")
    .reduce((node, key) => {
      if (!isRecord(node) || !(key in node)) throw new Error(`$ref "${ref}" does not resolve`);
      return node[key];
    }, rootSchema);
};

const KEYWORDS = {
  $ref: (ref, value, ctx) => validate(resolveRef(ref, ctx.rootSchema), value, ctx.pointer, ctx.rootSchema),
  type: (expected, value, ctx) => {
    const actual = typeOf(value);
    const matches = actual === expected || (expected === "number" && actual === "integer");
    return matches ? [] : fail(ctx.pointer, "type", `expected ${expected}, got ${actual}`);
  },
  const: (expected, value, ctx) =>
    sameJson(expected, value) ? [] : fail(ctx.pointer, "const", `expected ${JSON.stringify(expected)}`),
  enum: (allowed, value, ctx) =>
    allowed.some((option) => sameJson(option, value))
      ? []
      : fail(ctx.pointer, "enum", `expected one of ${JSON.stringify(allowed)}`),
  required: (names, value, ctx) =>
    isRecord(value)
      ? names
          .filter((name) => !(name in value))
          .flatMap((name) => fail(ctx.pointer, "required", `missing required field "${name}"`))
      : [],
  properties: (properties, value, ctx) =>
    isRecord(value)
      ? Object.entries(properties)
          .filter(([name]) => name in value)
          .flatMap(([name, sub]) => validate(sub, value[name], `${ctx.pointer}/${name}`, ctx.rootSchema))
      : [],
  additionalProperties: (rule, value, ctx) => {
    if (!isRecord(value)) return [];
    const known = new Set(Object.keys(ctx.schema.properties ?? {}));
    return Object.keys(value)
      .filter((name) => !known.has(name))
      .flatMap((name) =>
        rule === false
          ? fail(`${ctx.pointer}/${name}`, "additionalProperties", `unexpected field "${name}"`)
          : validate(rule, value[name], `${ctx.pointer}/${name}`, ctx.rootSchema),
      );
  },
  items: (itemSchema, value, ctx) =>
    Array.isArray(value)
      ? value.flatMap((item, index) => validate(itemSchema, item, `${ctx.pointer}/${index}`, ctx.rootSchema))
      : [],
  minItems: (min, value, ctx) =>
    Array.isArray(value) && value.length < min ? fail(ctx.pointer, "minItems", `needs at least ${min} item(s)`) : [],
  maxItems: (max, value, ctx) =>
    Array.isArray(value) && value.length > max ? fail(ctx.pointer, "maxItems", `allows at most ${max} item(s)`) : [],
  minLength: (min, value, ctx) =>
    typeof value === "string" && [...value].length < min
      ? fail(ctx.pointer, "minLength", `needs at least ${min} character(s)`)
      : [],
  pattern: (pattern, value, ctx) =>
    typeof value === "string" && !new RegExp(pattern, "u").test(value)
      ? fail(ctx.pointer, "pattern", `"${value}" does not match ${pattern}`)
      : [],
  minimum: (min, value, ctx) =>
    typeof value === "number" && value < min ? fail(ctx.pointer, "minimum", `must be at least ${min}`) : [],
  maximum: (max, value, ctx) =>
    typeof value === "number" && value > max ? fail(ctx.pointer, "maximum", `must be at most ${max}`) : [],
  if: (condition, value, ctx) => {
    const branch = validate(condition, value, ctx.pointer, ctx.rootSchema).length === 0 ? ctx.schema.then : ctx.schema.else;
    return branch === undefined ? [] : validate(branch, value, ctx.pointer, ctx.rootSchema);
  },
};

function validate(schema, value, pointer, rootSchema) {
  if (!isRecord(schema)) throw new Error(`Schema at "${pointer}" must be an object`);
  return Object.entries(schema).flatMap(([keyword, keywordValue]) => {
    if (ANNOTATIONS.has(keyword)) return [];
    const check = KEYWORDS[keyword];
    if (check === undefined) {
      throw new Error(`Schema keyword "${keyword}" is not supported by this checker; extend the checker before using it`);
    }
    return check(keywordValue, value, { schema, rootSchema, pointer });
  });
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const jsonFiles = (dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();

const describe = (failures) => failures.map((f) => `${f.pointer || "/"} ${f.keyword}: ${f.message}`).join("; ");

const checkValidExamples = (schema) =>
  jsonFiles(validDir).map((name) => {
    const failures = validate(schema, readJson(join(validDir, name)), "", schema);
    return {
      subject: relative(root, join(validDir, name)),
      pass: failures.length === 0,
      detail: failures.length === 0 ? "valid" : describe(failures),
    };
  });

const checkInvalidExamples = (schema, expectedFailures) => {
  const files = jsonFiles(invalidDir);
  const results = files.map((name) => {
    const subject = relative(root, join(invalidDir, name));
    const expected = expectedFailures[name];
    if (expected === undefined) {
      return { subject, pass: false, detail: "no entry in expected-failures.json" };
    }
    const failures = validate(schema, readJson(join(invalidDir, name)), "", schema);
    const hit = failures.some((f) => f.pointer === expected.pointer && f.keyword === expected.keyword);
    return {
      subject,
      pass: hit,
      detail: hit
        ? `rejected as expected (${expected.pointer || "/"} ${expected.keyword})`
        : `expected rejection at ${expected.pointer || "/"} ${expected.keyword}, got: ${describe(failures) || "valid"}`,
    };
  });
  const orphans = Object.keys(expectedFailures)
    .filter((name) => !files.includes(name))
    .map((name) => ({
      subject: `examples/envelopes/expected-failures.json: ${name}`,
      pass: false,
      detail: "listed but the file does not exist",
    }));
  return [...results, ...orphans];
};

const checkContractBlocks = (schema) => {
  const markdown = readFileSync(contractPath, "utf8");
  const blocks = [...markdown.matchAll(/^```json\n([\s\S]*?)^```$/gm)].map((match) => ({
    line: markdown.slice(0, match.index).split("\n").length,
    text: match[1],
  }));
  return blocks.map(({ line, text }) => {
    const subject = `MODULE_CONTRACT.md:${line}`;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      return { subject, pass: false, detail: `json block does not parse: ${error.message}` };
    }
    if (!isRecord(parsed) || !("ok" in parsed)) return { subject, pass: true, detail: "json block parses" };
    const failures = validate(schema, parsed, "", schema);
    return {
      subject,
      pass: failures.length === 0,
      detail: failures.length === 0 ? "envelope in the contract is valid" : describe(failures),
    };
  });
};

const requireAtLeast = (results, count, what) =>
  results.length >= count
    ? []
    : [{ subject: what, pass: false, detail: `expected at least ${count}, found ${results.length}` }];

const schema = readJson(schemaPath);
const valid = checkValidExamples(schema);
const invalid = checkInvalidExamples(schema, readJson(expectedFailuresPath));
const contract = checkContractBlocks(schema);
const results = [
  ...valid,
  ...requireAtLeast(valid, 4, "examples/envelopes/valid"),
  ...invalid,
  ...requireAtLeast(invalid, 1, "examples/envelopes/invalid"),
  ...contract,
  ...requireAtLeast(
    contract.filter((r) => r.detail === "envelope in the contract is valid"),
    1,
    "envelopes inside MODULE_CONTRACT.md",
  ),
];

for (const result of results) {
  process.stdout.write(`${result.pass ? "pass" : "FAIL"}  ${result.subject}  ${result.detail}\n`);
}
const failed = results.filter((result) => !result.pass).length;
process.stdout.write(`\n${results.length - failed} passed, ${failed} failed\n`);
process.exitCode = failed === 0 ? 0 : 1;
