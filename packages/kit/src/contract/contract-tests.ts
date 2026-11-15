import assert from "node:assert/strict";
import { test } from "node:test";
import { runContract } from "./checks.ts";

export const contractTests = (binPath: string): void => {
  for (const { id, title, problems } of runContract(binPath)) {
    test(`contract ${id}: ${title}`, () => {
      assert.deepEqual(problems, []);
    });
  }
};
