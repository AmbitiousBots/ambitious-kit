import { isRecord } from "./json.ts";

export type SchemaProblem = { readonly pointer: string; readonly keyword: string; readonly message: string };

type Schema = Readonly<Record<string, unknown>>;

type Context = { readonly schema: Schema; readonly root: Schema; readonly pointer: string };

type Keyword = (rule: unknown, value: unknown, context: Context) => readonly SchemaProblem[];

const ANNOTATIONS: ReadonlySet<string> = new Set(["$schema", "title", "description", "$defs"]);

const typeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
};

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const problem = (pointer: string, keyword: string, message: string): readonly SchemaProblem[] => [{ pointer, keyword, message }];

const unsupported = (message: string): never => {
  throw new Error(message);
};

const subschema = (rule: unknown, pointer: string): Schema =>
  isRecord(rule) ? rule : unsupported(`The schema at "${pointer}" must be an object.`);

const resolveRef = (ref: unknown, root: Schema): Schema => {
  if (typeof ref !== "string" || !ref.startsWith("#/")) return unsupported(`The $ref ${JSON.stringify(ref)} is not a local "#/..." reference.`);
  const target = ref
    .slice(2)
    .split("/")
    .reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), root);
  return isRecord(target) ? target : unsupported(`The $ref "${ref}" does not resolve.`);
};

const list = (rule: unknown): readonly unknown[] => (Array.isArray(rule) ? rule : unsupported("The schema keyword needs a list."));

const KEYWORDS: Readonly<Record<string, Keyword>> = {
  $ref: (rule, value, { root, pointer }) => check(resolveRef(rule, root), value, pointer, root),
  type: (rule, value, { pointer }) => {
    const actual = typeOf(value);
    return actual === rule || (rule === "number" && actual === "integer") ? [] : problem(pointer, "type", `expected ${String(rule)}, got ${actual}`);
  },
  const: (rule, value, { pointer }) => (sameJson(rule, value) ? [] : problem(pointer, "const", `expected ${JSON.stringify(rule)}`)),
  enum: (rule, value, { pointer }) =>
    list(rule).some((option) => sameJson(option, value)) ? [] : problem(pointer, "enum", `expected one of ${JSON.stringify(rule)}`),
  required: (rule, value, { pointer }) =>
    isRecord(value)
      ? list(rule)
          .filter((name) => typeof name === "string" && !(name in value))
          .flatMap((name) => problem(pointer, "required", `missing required field "${String(name)}"`))
      : [],
  properties: (rule, value, { root, pointer }) =>
    isRecord(value) && isRecord(rule)
      ? Object.entries(rule)
          .filter(([name]) => name in value)
          .flatMap(([name, sub]) => check(subschema(sub, pointer), value[name], `${pointer}/${name}`, root))
      : [],
  additionalProperties: (rule, value, { schema, root, pointer }) => {
    if (!isRecord(value)) return [];
    const known = isRecord(schema.properties) ? schema.properties : {};
    return Object.keys(value)
      .filter((name) => !(name in known))
      .flatMap((name) =>
        rule === false
          ? problem(`${pointer}/${name}`, "additionalProperties", `unexpected field "${name}"`)
          : check(subschema(rule, pointer), value[name], `${pointer}/${name}`, root),
      );
  },
  items: (rule, value, { root, pointer }) =>
    Array.isArray(value) ? value.flatMap((item: unknown, index) => check(subschema(rule, pointer), item, `${pointer}/${index}`, root)) : [],
  anyOf: (rule, value, { root, pointer }) =>
    list(rule).some((option) => check(subschema(option, pointer), value, pointer, root).length === 0)
      ? []
      : problem(pointer, "anyOf", "matches none of the allowed shapes"),
  minItems: (rule, value, { pointer }) =>
    Array.isArray(value) && typeof rule === "number" && value.length < rule ? problem(pointer, "minItems", `needs at least ${rule} item(s)`) : [],
  maxItems: (rule, value, { pointer }) =>
    Array.isArray(value) && typeof rule === "number" && value.length > rule ? problem(pointer, "maxItems", `allows at most ${rule} item(s)`) : [],
  minLength: (rule, value, { pointer }) =>
    typeof value === "string" && typeof rule === "number" && [...value].length < rule
      ? problem(pointer, "minLength", `needs at least ${rule} character(s)`)
      : [],
  pattern: (rule, value, { pointer }) =>
    typeof value === "string" && typeof rule === "string" && !new RegExp(rule, "u").test(value)
      ? problem(pointer, "pattern", `"${value}" does not match ${rule}`)
      : [],
  minimum: (rule, value, { pointer }) =>
    typeof value === "number" && typeof rule === "number" && value < rule ? problem(pointer, "minimum", `must be at least ${rule}`) : [],
  maximum: (rule, value, { pointer }) =>
    typeof value === "number" && typeof rule === "number" && value > rule ? problem(pointer, "maximum", `must be at most ${rule}`) : [],
};

function check(schema: Schema, value: unknown, pointer: string, root: Schema): readonly SchemaProblem[] {
  return Object.entries(schema).flatMap(([keyword, rule]) => {
    if (ANNOTATIONS.has(keyword)) return [];
    const keywordCheck = KEYWORDS[keyword];
    if (keywordCheck === undefined) return unsupported(`The schema keyword "${keyword}" is not supported. Extend the checker before using it.`);
    return keywordCheck(rule, value, { schema, root, pointer });
  });
}

export const schemaProblems = (schema: unknown, value: unknown): readonly SchemaProblem[] => {
  const root = subschema(schema, "");
  return check(root, value, "", root);
};

export const describeSchemaProblems = (problems: readonly SchemaProblem[]): string =>
  problems.map(({ pointer, keyword, message }) => `${pointer === "" ? "/" : pointer} ${keyword}: ${message}`).join("; ");
