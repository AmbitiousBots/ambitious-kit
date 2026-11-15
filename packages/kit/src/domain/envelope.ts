import { isRecord, type JsonObject } from "./json.ts";

export type ErrorCode = `E_${string}`;

export type ErrorEntry = { readonly code: ErrorCode; readonly message: string; readonly hint: string };

export type Meta = { readonly now: string; readonly seed: number; readonly version: string };

export type Identity = {
  readonly schemaVersion: number;
  readonly module: string;
  readonly command: string;
  readonly meta: Meta;
};

type Shared = Identity & { readonly data: JsonObject };

export type OkEnvelope = Shared & { readonly ok: true; readonly errors: readonly [] };

export type ErrEnvelope = Shared & { readonly ok: false; readonly errors: readonly [ErrorEntry, ...ErrorEntry[]] };

export type Envelope = OkEnvelope | ErrEnvelope;

export type ExitCode = 0 | 1 | 2;

export const INTERNAL_ERROR_CODES: ReadonlySet<string> = new Set(["E_DB", "E_MIGRATION", "E_INTERNAL"]);

export const envelope = {
  ok: ({ schemaVersion, module, command, meta }: Identity, data: JsonObject): OkEnvelope => ({
    ok: true,
    schemaVersion,
    module,
    command,
    data,
    errors: [],
    meta,
  }),
  err: (
    { schemaVersion, module, command, meta }: Identity,
    errors: readonly [ErrorEntry, ...ErrorEntry[]],
    data: JsonObject = {},
  ): ErrEnvelope => ({ ok: false, schemaVersion, module, command, data, errors, meta }),
};

export const exitCodeOf = (result: Envelope): ExitCode => {
  if (result.ok) return 0;
  return result.errors.some(({ code }) => INTERNAL_ERROR_CODES.has(code)) ? 2 : 1;
};

export const serialize = (result: Envelope): string => `${JSON.stringify(result)}\n`;

const MODULE_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const COMMAND_NAME = /^([a-z][a-z0-9-]*( [a-z][a-z0-9-]*)*)?$/;
const ERROR_CODE = /^E_[A-Z0-9]+(_[A-Z0-9]+)*$/;
const NOW = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;
const VERSION = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$/;
const MAX_SEED = 4294967295;

export const isModuleName = (value: string): boolean => MODULE_NAME.test(value);
export const isCommandName = (value: string): boolean => value !== "" && COMMAND_NAME.test(value);
export const isErrorCode = (value: string): value is ErrorCode => ERROR_CODE.test(value);
export const isSemver = (value: string): boolean => VERSION.test(value);

const onlyFields = (value: Readonly<Record<string, unknown>>, names: readonly string[], where: string): string[] => [
  ...names.filter((name) => !(name in value)).map((name) => `${where} is missing the field "${name}".`),
  ...Object.keys(value)
    .filter((name) => !names.includes(name))
    .map((name) => `${where} has the unexpected field "${name}".`),
];

const nonEmptyString = (value: unknown): boolean => typeof value === "string" && value.length > 0;

const errorProblems = (value: unknown, index: number): string[] => {
  const where = `errors[${index}]`;
  if (!isRecord(value)) return [`${where} must be an object.`];
  return [
    ...onlyFields(value, ["code", "message", "hint"], where),
    ...(typeof value.code === "string" && ERROR_CODE.test(value.code) ? [] : [`${where}.code must look like E_NAME.`]),
    ...(nonEmptyString(value.message) ? [] : [`${where}.message must be a non-empty string.`]),
    ...(nonEmptyString(value.hint) ? [] : [`${where}.hint must be a non-empty string.`]),
  ];
};

const metaProblems = (value: unknown): string[] => {
  if (!isRecord(value)) return ["meta must be an object."];
  const { now, seed, version } = value;
  return [
    ...onlyFields(value, ["now", "seed", "version"], "meta"),
    ...(typeof now === "string" && NOW.test(now) ? [] : ["meta.now must be UTC with milliseconds, YYYY-MM-DDTHH:MM:SS.sssZ."]),
    ...(typeof seed === "number" && Number.isInteger(seed) && seed >= 0 && seed <= MAX_SEED
      ? []
      : ["meta.seed must be an integer from 0 to 4294967295."]),
    ...(typeof version === "string" && VERSION.test(version) ? [] : ["meta.version must be a semantic version."]),
  ];
};

export const envelopeProblems = (value: unknown): string[] => {
  if (!isRecord(value)) return ["The envelope must be a JSON object."];
  const { ok, schemaVersion, module, command, data, errors, meta } = value;
  const errorList = Array.isArray(errors) ? errors : null;
  return [
    ...onlyFields(value, ["ok", "schemaVersion", "module", "command", "data", "errors", "meta"], "The envelope"),
    ...(typeof ok === "boolean" ? [] : ["ok must be true or false."]),
    ...(typeof schemaVersion === "number" && Number.isInteger(schemaVersion) && schemaVersion >= 1
      ? []
      : ["schemaVersion must be an integer, 1 or higher."]),
    ...(typeof module === "string" && MODULE_NAME.test(module) ? [] : ["module must be the lower-case name after ambitious-."]),
    ...(typeof command === "string" && COMMAND_NAME.test(command)
      ? []
      : ["command must be lower-case words joined by one space, or empty."]),
    ...(isRecord(data) ? [] : ["data must be a JSON object."]),
    ...(errorList === null ? ["errors must be a list."] : errorList.flatMap(errorProblems)),
    ...(ok === true && errorList !== null && errorList.length > 0 ? ["ok is true, so errors must be empty."] : []),
    ...(ok === false && errorList !== null && errorList.length === 0 ? ["ok is false, so errors must hold at least one error."] : []),
    ...metaProblems(meta),
  ];
};
