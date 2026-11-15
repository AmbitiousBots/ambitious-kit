import assert from "node:assert/strict";
import { test } from "node:test";
import { greet } from "../src/domain/greeting.ts";

test("greets by name at the given time", () => {
  const greeting = greet("Ada", { now: () => new Date("2026-01-01T00:00:00Z") });
  assert.deepEqual(greeting, { text: "Hello, Ada.", createdAt: "2026-01-01T00:00:00.000Z" });
});
