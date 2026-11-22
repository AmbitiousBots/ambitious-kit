import { isRecord, type JsonObject } from "./json.ts";

export const FIELD_TYPES = ["string", "number", "integer", "boolean", "object", "array"] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type InputField = { readonly name: string; readonly type: FieldType; readonly required: boolean };

export type InputShape = { readonly fields: readonly InputField[]; readonly example?: JsonObject };

const ALLOWED = FIELD_TYPES.join(", ");

const isFieldType = (value: string): value is FieldType => FIELD_TYPES.some((type) => type === value);

const MATCHES: Readonly<Record<FieldType, (value: unknown) => boolean>> = {
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number" && Number.isFinite(value),
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === "boolean",
  object: isRecord,
  array: Array.isArray,
};

const ARTICLE: Readonly<Record<FieldType, string>> = {
  string: "a string",
  number: "a number",
  integer: "an integer",
  boolean: "a boolean",
  object: "an object",
  array: "an array",
};

const kindOf = (value: unknown): string => {
  if (Array.isArray(value)) return "an array";
  if (typeof value === "string") return "a string";
  if (typeof value === "number") return "a number";
  if (typeof value === "boolean") return "a boolean";
  return isRecord(value) ? "an object" : "not a JSON value";
};

const fieldProblems = (field: unknown, position: number, seen: readonly unknown[]): readonly string[] => {
  if (!isRecord(field) || typeof field.name !== "string" || field.name === "") {
    return [`field ${position} must have a name, a string that is not empty`];
  }
  const { name, type, required } = field;
  const typeProblem = (() => {
    if (typeof type !== "string") return [`field "${name}" has a type that is not a string; use one of: ${ALLOWED}`];
    return isFieldType(type) ? [] : [`field "${name}" has the unknown type "${type}"; use one of: ${ALLOWED}`];
  })();
  return [
    ...(seen.includes(name) ? [`field "${name}" is listed more than once`] : []),
    ...typeProblem,
    ...(typeof required === "boolean" ? [] : [`field "${name}" must say required as true or false`]),
  ];
};

const exampleProblems = (example: unknown, fields: readonly unknown[]): readonly string[] => {
  if (!isRecord(example)) return ["the example must be a JSON object"];
  const listed = fields.flatMap((field) => (isRecord(field) && typeof field.name === "string" ? [field] : []));
  const names = listed.map(({ name }) => name);
  return [
    ...Object.keys(example)
      .filter((key) => !names.includes(key))
      .map((key) => `the example has the field "${key}", which is not a listed field`),
    ...listed.flatMap(({ name, type, required }) => {
      const key = String(name);
      if (!Object.hasOwn(example, key)) return required === true ? [`the example leaves out the required field "${key}"`] : [];
      if (typeof type !== "string" || !isFieldType(type)) return [];
      const value = example[key];
      if (value === null) {
        return [`the example field "${key}" is null, but its type is ${type}; null is never an example value, so give ${ARTICLE[type]} or leave the field out`];
      }
      return MATCHES[type](value) ? [] : [`the example field "${key}" must be ${ARTICLE[type]}, but is ${kindOf(value)}`];
    }),
  ];
};

export const shapeProblems = (command: string, takesInput: boolean, shape: unknown): readonly string[] => {
  const problems = ((): readonly string[] => {
    if (!isRecord(shape) || !Array.isArray(shape.fields)) return ["the input shape must have a list of fields"];
    const fields: readonly unknown[] = shape.fields;
    const names = fields.map((field) => (isRecord(field) ? field.name : undefined));
    return [
      ...(takesInput ? [] : ["an input shape is declared, but the command takes no input"]),
      ...fields.flatMap((field, index) => fieldProblems(field, index + 1, names.slice(0, index))),
      ...(shape.example === undefined ? [] : exampleProblems(shape.example, fields)),
    ];
  })();
  return problems.map((problem) => `command "${command}": ${problem}`);
};

export const listedShape = ({ fields, example }: InputShape): JsonObject => ({
  fields: fields.map(({ name, type, required }) => ({ name, type, required })),
  ...(example === undefined ? {} : { example }),
});
