import assert from "node:assert/strict";
import { test } from "node:test";
import { fixedClock, seededRng } from "@ambitious/kit/domain/clock";
import { Failure } from "@ambitious/kit/domain/failure";
import { greet, parseGreetingRequest } from "../src/domain/greeting.ts";

const clock = fixedClock(new Date("2026-01-01T00:00:00Z"));

test("the same name, time and seed always give the same greeting", () => {
  const greeting = greet({ name: "world" }, clock, seededRng(7));
  assert.deepEqual(greeting, { name: "world", text: "Hello, world.", createdAt: "2026-01-01T00:00:00.000Z" });
  assert.deepEqual(greet({ name: "world" }, clock, seededRng(7)), greeting);
});

test("the seed chooses the opening words", () => {
  const texts = new Set([...Array(50).keys()].map((seed) => greet({ name: "world" }, clock, seededRng(seed)).text));
  assert.deepEqual([...texts].sort(), ["Good day, world.", "Hello, world.", "Welcome, world."]);
});

test("a request needs a name of 1 to 100 characters, and spaces around it are dropped", () => {
  assert.deepEqual(parseGreetingRequest({ name: "  world " }), { name: "world" });
  assert.deepEqual(parseGreetingRequest({ name: "w".repeat(100) }), { name: "w".repeat(100) });
  for (const raw of [{}, { name: "" }, { name: "   " }, { name: 7 }, { name: "w".repeat(101) }, null, "world", ["world"]]) {
    assert.throws(
      () => parseGreetingRequest(raw),
      (error) => error instanceof Failure && error.errors[0].code === "E_INPUT_SCHEMA",
      JSON.stringify(raw),
    );
  }
});
