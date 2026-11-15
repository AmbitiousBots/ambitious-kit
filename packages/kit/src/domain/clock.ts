export type Clock = { readonly now: () => Date };

export type Rng = {
  readonly next: () => number;
  readonly int: (boundExclusive: number) => number;
};

export const MAX_SEED = 4294967295;

export const fixedClock = (instant: Date): Clock => {
  const milliseconds = instant.getTime();
  return { now: () => new Date(milliseconds) };
};

export const seededRng = (seed: number): Rng => {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  return { next, int: (boundExclusive) => Math.floor(next() * boundExclusive) };
};

const NOW_FLAG = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;
const SEED_FLAG = /^\d{1,10}$/;

const offsetMinutes = (zone: string): number | null => {
  if (zone === "Z") return 0;
  const hours = Number(zone.slice(1, 3));
  const minutes = Number(zone.slice(4, 6));
  if (hours > 23 || minutes > 59) return null;
  return (zone.startsWith("-") ? -1 : 1) * (hours * 60 + minutes);
};

export const parseNow = (text: string): Date | null => {
  const match = NOW_FLAG.exec(text);
  if (match === null) return null;
  const [, year, month, day, hour, minute, second = "0", fraction = "0", zone = "Z"] = match;
  const offset = offsetMinutes(zone);
  if (offset === null) return null;
  const fields = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)] as const;
  const local = new Date(0);
  local.setUTCFullYear(fields[0], fields[1], fields[2]);
  local.setUTCHours(fields[3], fields[4], fields[5], Number(fraction.padEnd(3, "0")));
  const roundTrip = [
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    local.getUTCHours(),
    local.getUTCMinutes(),
    local.getUTCSeconds(),
  ];
  if (fields.some((field, index) => field !== roundTrip[index])) return null;
  const instant = new Date(local.getTime() - offset * 60_000);
  const resultYear = instant.getUTCFullYear();
  return resultYear >= 1 && resultYear <= 9999 ? instant : null;
};

export const parseSeed = (text: string): number | null => {
  if (!SEED_FLAG.test(text)) return null;
  const seed = Number(text);
  return seed <= MAX_SEED ? seed : null;
};
