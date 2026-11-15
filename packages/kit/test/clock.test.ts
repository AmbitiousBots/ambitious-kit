import assert from "node:assert/strict";
import { test } from "node:test";
import { fixedClock, parseNow, parseSeed, seededRng } from "../src/domain/clock.ts";

test("--now is read as an instant and needs a time zone", () => {
  const accepted: readonly (readonly [string, string])[] = [
    ["2026-01-01T00:00:00Z", "2026-01-01T00:00:00.000Z"],
    ["2026-03-05T09:30:00+01:00", "2026-03-05T08:30:00.000Z"],
    ["2026-03-05T09:30-05:30", "2026-03-05T15:00:00.000Z"],
    ["2026-12-31T23:59:59.5Z", "2026-12-31T23:59:59.500Z"],
    ["2024-02-29T12:00:00.123Z", "2024-02-29T12:00:00.123Z"],
    ["0099-01-01T00:00:00Z", "0099-01-01T00:00:00.000Z"],
  ];
  for (const [text, instant] of accepted) assert.equal(parseNow(text)?.toISOString(), instant, text);
  const refused = [
    "2026-01-01T00:00:00",
    "2026-01-01",
    "yesterday",
    "",
    "2026-02-30T00:00:00Z",
    "2025-02-29T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z",
    "2026-01-01T00:00:00+24:00",
    "2026-01-01T00:00:00.1234Z",
    "2026-01-01 00:00:00Z",
    "0000-01-01T00:00:00Z",
    "9999-12-31T23:59:59-01:00",
  ];
  for (const text of refused) assert.equal(parseNow(text), null, text);
});

test("--seed is a whole number from 0 to 4294967295", () => {
  assert.equal(parseSeed("0"), 0);
  assert.equal(parseSeed("7"), 7);
  assert.equal(parseSeed("4294967295"), 4294967295);
  for (const text of ["4294967296", "-1", "1.5", "", "seven", "+7", "1e3", "99999999999"]) assert.equal(parseSeed(text), null, text);
});

test("a seeded random source gives the same numbers for the same seed", () => {
  const draws = (seed: number): number[] => {
    const rng = seededRng(seed);
    return [rng.int(1000), rng.int(1000), rng.int(1000), rng.int(1000)];
  };
  assert.deepEqual(draws(7), [11, 61, 976, 699]);
  assert.deepEqual(draws(4294967295), draws(4294967295));
  assert.notDeepEqual(draws(7), draws(8));
  const unit = seededRng(42).next();
  assert.ok(unit >= 0 && unit < 1);
});

test("a fixed clock always answers the same instant, even if a caller changes the date it got", () => {
  const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));
  clock.now().setUTCFullYear(1999);
  assert.equal(clock.now().toISOString(), "2026-01-01T00:00:00.000Z");
});
