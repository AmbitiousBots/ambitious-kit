export type Flags = {
  readonly in: string | null;
  readonly db: string | null;
  readonly now: string | null;
  readonly seed: string | null;
  readonly help: boolean;
};

export type ParsedArgs = { readonly words: readonly string[]; readonly flags: Flags; readonly problems: readonly string[] };

const VALUE_FLAGS = ["in", "db", "now", "seed"] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

const SWITCHES = ["json", "help"] as const;
type Switch = (typeof SWITCHES)[number];

const isSwitch = (name: string): name is Switch => SWITCHES.some((flag) => flag === name);

const isValueFlag = (name: string): name is ValueFlag => VALUE_FLAGS.some((flag) => flag === name);

export const FLAG_USAGE = "[--in file] [--db path] [--now ISO8601] [--seed int] [--json] [--help]";

export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const words: string[] = [];
  const problems: string[] = [];
  const values = new Map<ValueFlag, string>();
  const switches = new Set<Switch>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (!token.startsWith("--")) {
      words.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const name = token.slice(2, equals === -1 ? undefined : equals);
    if (isSwitch(name) && equals === -1) {
      if (switches.has(name)) problems.push(`The flag --${name} was given more than once.`);
      switches.add(name);
      continue;
    }
    if (!isValueFlag(name)) {
      problems.push(`Unknown flag "${token}".`);
      continue;
    }
    const value = equals === -1 ? argv[index + 1] : token.slice(equals + 1);
    if (equals === -1) index += 1;
    if (value === undefined || value === "" || (equals === -1 && value.startsWith("--"))) {
      problems.push(`The flag --${name} needs a value.`);
      if (value !== undefined && equals === -1 && value !== "") index -= 1;
      continue;
    }
    if (values.has(name)) problems.push(`The flag --${name} was given more than once.`);
    values.set(name, value);
  }
  const flag = (name: ValueFlag): string | null => values.get(name) ?? null;
  return { words, flags: { in: flag("in"), db: flag("db"), now: flag("now"), seed: flag("seed"), help: switches.has("help") }, problems };
};
