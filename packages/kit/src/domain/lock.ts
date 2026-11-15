import { failure } from "./failure.ts";
import { isRecord } from "./json.ts";

export type LockRow = {
  readonly module: string;
  readonly version: string;
  readonly url: string;
  readonly sha256: string;
  readonly kind: "mjs" | "pyz";
  readonly asset: string;
  readonly release: string;
  readonly tag: string;
};

export const LOCK_PATTERNS = {
  module: "^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$",
  version:
    "^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(?:-(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(?:\\.(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$",
  url: "^https://[^\\s/?#@]+/[^\\s?#]+\\.(?:mjs|pyz)$",
  sha256: "^[0-9a-f]{64}$",
} as const;

const RELEASE_TAG = /^[0-9A-Za-z][0-9A-Za-z._+-]*$/;

const FIELDS = ["module", "version", "url", "sha256"] as const;

const invalid = (message: string): never => {
  throw failure("E_INPUT_SCHEMA", message, "The lock is a list of { module, version, url, sha256 } rows, one per module. Restore the lock that came with the template; never edit pins by hand.");
};

const field = (row: Readonly<Record<string, unknown>>, name: (typeof FIELDS)[number], where: string): string => {
  const value = row[name];
  if (typeof value !== "string" || !new RegExp(LOCK_PATTERNS[name], "u").test(value)) {
    return invalid(`${where}.${name} is missing or is not a valid ${name}.`);
  }
  return value;
};

const parseRow = (value: unknown, index: number): LockRow => {
  const where = `lock[${index}]`;
  if (!isRecord(value)) return invalid(`${where} must be an object.`);
  const extra = Object.keys(value).filter((key) => !FIELDS.some((name) => name === key));
  if (extra.length > 0) return invalid(`${where} has the unexpected field "${extra[0]}".`);
  const [module, version, url, sha256] = [field(value, "module", where), field(value, "version", where), field(value, "url", where), field(value, "sha256", where)];
  const segments = new URL(url).pathname.split("/").map((segment) => decodeURIComponent(segment));
  const asset = segments.at(-1);
  const tag = segments.at(-2);
  const kind = (["mjs", "pyz"] as const).find((extension) => asset === `ambitious-${module}-${version}.${extension}`);
  if (asset === undefined || kind === undefined) return invalid(`${where}.url must end in ambitious-${module}-${version}.mjs or .pyz, the asset of the pinned module and version.`);
  if (tag === undefined || !RELEASE_TAG.test(tag)) return invalid(`${where}.url must name the release the asset belongs to before the file name.`);
  return { module, version, url, sha256, kind, asset, tag, release: url.slice(0, url.lastIndexOf("/")) };
};

export const parseLock = (value: unknown): readonly LockRow[] => {
  if (!Array.isArray(value)) return invalid("The lock must be a list.");
  const rows = value.map(parseRow);
  const repeated = rows.find((row, index) => rows.findIndex((other) => other.module === row.module) !== index);
  if (repeated !== undefined) return invalid(`The module ${repeated.module} is pinned more than once.`);
  return rows;
};

const core = (version: string): readonly number[] => (version.split(/[-+]/)[0] ?? "").split(".").map(Number);

export const isNewerVersion = (candidate: string, than: string): boolean => {
  const [a, b] = [core(candidate), core(than)];
  const differing = a.findIndex((part, index) => part !== (b[index] ?? 0));
  if (differing !== -1) return (a[differing] ?? 0) > (b[differing] ?? 0);
  return !candidate.includes("-") && than.includes("-");
};
