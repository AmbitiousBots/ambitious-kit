import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanRepo, lintMessages } from "./lint.ts";

const COMMENT = "Delete the comment. Encode the rule in a type, name or test; if it is a non-obvious why, use // WHY: (budget 9 left).";
const CLOCK = "Only src/cli reads the clock. Take the time as an argument (a Clock, or the --now value) so the same input always gives the same output.";
const RANDOM = "Only src/cli draws randomness. Take an Rng seeded from --seed as an argument so the same input always gives the same output.";
const TIMERS = "Timers are only allowed in src/cli. Return the delay as data and let the CLI shell wait, or take a deadline as an argument.";
const CONSOLE = "console is only allowed in src/cli. Return data and let the CLI shell print the one JSON envelope on stdout and logs on stderr.";
const NETWORK = "Network is only allowed in src/ai/ and src/install/. Move the call into src/ai/ and pass its result into src/domain as data.";
const ANY = "any switches the type checker off. Use unknown and parse it at the boundary, or name the real type.";
const NON_NULL = "The ! assertion hides a missing value. Handle undefined where it can happen, or change the type so the value is always there.";
const AS = "as casts overrule the type checker. Parse the value at the boundary or narrow it with a type guard; only `as const` is allowed.";
const DEFAULT_EXPORT = "Default exports let every importer pick its own name. Export a named value so the name is the same everywhere.";
const BARREL = "Barrel files hide where a name is defined. Import each name from the file that defines it and delete this re-export.";

type Case = {
  readonly name: string;
  readonly file: string;
  readonly code: string;
  readonly fails: readonly string[];
};

const cases: readonly Case[] = [
  { name: "line comment", file: "src/domain/a.ts", code: "// note\nexport const a = 1;\n", fails: [COMMENT] },
  { name: "trailing comment", file: "src/domain/a.ts", code: "export const a = 1; // note\n", fails: [COMMENT] },
  { name: "block comment", file: "src/domain/a.ts", code: "/* note */\nexport const a = 1;\n", fails: [COMMENT] },
  { name: "doc comment", file: "src/domain/a.ts", code: "/** Adds. */\nexport const a = 1;\n", fails: [COMMENT] },
  { name: "comment in a test file", file: "test/a.test.ts", code: "// Phase 1\nexport const a = 1;\n", fails: [COMMENT] },
  { name: "comment in a script", file: "scripts/a.mjs", code: "// note\nexport const a = 1;\n", fails: [COMMENT] },
  { name: "WHY above code", file: "src/domain/a.ts", code: "// WHY: the vendor rounds half down.\nexport const a = 1;\n", fails: [] },
  { name: "SAFETY above code", file: "src/db/a.ts", code: "// SAFETY: the id is checked by the caller.\nexport const a = 1;\n", fails: [] },
  {
    name: "WHY and SAFETY stacked above code",
    file: "src/db/a.ts",
    code: "// WHY: the vendor rounds half down.\n// SAFETY: the id is checked by the caller.\nexport const a = 1;\n",
    fails: [],
  },
  { name: "WHY after code on the same line", file: "src/domain/a.ts", code: "export const a = 1; // WHY: the vendor rounds half down.\n", fails: [COMMENT] },
  { name: "WHY with a blank line before code", file: "src/domain/a.ts", code: "// WHY: the vendor rounds half down.\n\nexport const a = 1;\n", fails: [COMMENT] },
  { name: "WHY at the end of the file", file: "src/domain/a.ts", code: "export const a = 1;\n// WHY: the vendor rounds half down.\n", fails: [COMMENT] },
  { name: "WHY above an ordinary comment", file: "src/domain/a.ts", code: "// WHY: the vendor rounds half down.\n// and more\nexport const a = 1;\n", fails: [COMMENT, COMMENT] },
  { name: "WHY with no reason", file: "src/domain/a.ts", code: "// WHY:\nexport const a = 1;\n", fails: [COMMENT] },
  { name: "WHY as a block comment", file: "src/domain/a.ts", code: "/* WHY: the vendor rounds half down. */\nexport const a = 1;\n", fails: [COMMENT] },
  {
    name: "license header block",
    file: "src/domain/a.ts",
    code: "/*\n * Copyright 2026 Example Corporation\n * SPDX-License-Identifier: Apache-2.0\n */\nexport const a = 1;\n",
    fails: [],
  },
  {
    name: "license header lines",
    file: "src/domain/a.ts",
    code: "// Copyright 2026 Example Corporation\n// SPDX-License-Identifier: Apache-2.0\n\nexport const a = 1;\n",
    fails: [],
  },
  {
    name: "license header after a shebang",
    file: "src/cli/a.ts",
    code: "#!/usr/bin/env node\n// SPDX-License-Identifier: Apache-2.0\nexport const a = 1;\n",
    fails: [],
  },
  {
    name: "comment after the license header",
    file: "src/domain/a.ts",
    code: "// SPDX-License-Identifier: Apache-2.0\n\n// note\nexport const a = 1;\n",
    fails: [COMMENT],
  },
  {
    name: "license text below code",
    file: "src/domain/a.ts",
    code: "export const a = 1;\n// Copyright 2026 Example Corporation\n",
    fails: [COMMENT],
  },
  {
    name: "ts-expect-error with a reason",
    file: "test/a.test.ts",
    code: "// @ts-expect-error the test passes a number on purpose\nexport const a: string = 1;\n",
    fails: [],
  },
  { name: "ts-expect-error without a reason", file: "test/a.test.ts", code: "// @ts-expect-error\nexport const a: string = 1;\n", fails: [COMMENT] },
  { name: "ts-ignore", file: "test/a.test.ts", code: "// @ts-ignore the test passes a number\nexport const a: string = 1;\n", fails: [COMMENT] },
  {
    name: "eslint-disable does not switch the rules off",
    file: "src/domain/a.ts",
    code: "/* eslint-disable */\nexport const a: any = 1;\n",
    fails: [COMMENT, ANY],
  },

  { name: "Date.now in domain", file: "src/domain/a.ts", code: "export const a = (): number => Date.now();\n", fails: [`'Date.now' is restricted from being used. ${CLOCK}`] },
  { name: "new Date() in domain", file: "src/domain/a.ts", code: "export const a = (): Date => new Date();\n", fails: [CLOCK] },
  { name: "Date() in domain", file: "src/domain/a.ts", code: "export const a = (): string => Date();\n", fails: [CLOCK] },
  { name: "new Date(value) in domain", file: "src/domain/a.ts", code: "export const a = (iso: string): Date => new Date(iso);\n", fails: [] },
  { name: "Math.random in domain", file: "src/domain/a.ts", code: "export const a = (): number => Math.random();\n", fails: [`'Math.random' is restricted from being used. ${RANDOM}`] },
  { name: "crypto.randomUUID in domain", file: "src/domain/a.ts", code: "export const a = (): string => crypto.randomUUID();\n", fails: [`'crypto.randomUUID' is restricted from being used. ${RANDOM}`] },
  { name: "Date.now in db", file: "src/db/a.ts", code: "export const a = (): number => Date.now();\n", fails: [`'Date.now' is restricted from being used. ${CLOCK}`] },
  {
    name: "clock and randomness in cli",
    file: "src/cli/a.ts",
    code: "export const now = new Date();\nexport const at = Date.now();\nexport const seed = Math.random();\n",
    fails: [],
  },

  { name: "setTimeout in domain", file: "src/domain/a.ts", code: "setTimeout(() => undefined, 1);\n", fails: [`Unexpected use of 'setTimeout'. ${TIMERS}`] },
  { name: "setInterval in ai", file: "src/ai/a.ts", code: "setInterval(() => undefined, 1);\n", fails: [`Unexpected use of 'setInterval'. ${TIMERS}`] },
  { name: "globalThis.setTimeout in db", file: "src/db/a.ts", code: "globalThis.setTimeout(() => undefined, 1);\n", fails: [`Unexpected use of 'setTimeout'. ${TIMERS}`] },
  {
    name: "node:timers import in domain",
    file: "src/domain/a.ts",
    code: 'import { setTimeout as wait } from "node:timers/promises";\nexport const a = wait;\n',
    fails: [`'node:timers/promises' import is restricted from being used by a pattern. ${TIMERS}`],
  },
  { name: "timers in cli", file: "src/cli/a.ts", code: "setTimeout(() => undefined, 1);\nsetInterval(() => undefined, 1);\n", fails: [] },
  { name: "a timer passed in as an argument", file: "src/domain/a.ts", code: "export const a = (clock: { setTimeout: () => void }): void => clock.setTimeout();\n", fails: [] },

  { name: "console in domain", file: "src/domain/a.ts", code: 'console.log("x");\n', fails: [`Unexpected use of 'console'. ${CONSOLE}`] },
  { name: "console in db", file: "src/db/a.ts", code: 'console.error("x");\n', fails: [`Unexpected use of 'console'. ${CONSOLE}`] },
  { name: "console in a test", file: "test/a.test.ts", code: 'console.log("x");\n', fails: [`Unexpected use of 'console'. ${CONSOLE}`] },
  { name: "console in cli", file: "src/cli/a.ts", code: 'console.error("x");\n', fails: [] },

  { name: "fetch in domain", file: "src/domain/a.ts", code: 'export const a = fetch("https://example.invalid");\n', fails: [`Unexpected use of 'fetch'. ${NETWORK}`] },
  { name: "fetch in cli", file: "src/cli/a.ts", code: 'export const a = fetch("https://example.invalid");\n', fails: [`Unexpected use of 'fetch'. ${NETWORK}`] },
  {
    name: "node:https import in db",
    file: "src/db/a.ts",
    code: 'import { get } from "node:https";\nexport const a = get;\n',
    fails: [`'node:https' import is restricted from being used by a pattern. ${NETWORK}`],
  },
  {
    name: "bare net import in cli",
    file: "src/cli/a.ts",
    code: 'import { connect } from "net";\nexport const a = connect;\n',
    fails: [`'net' import is restricted from being used by a pattern. ${NETWORK}`],
  },
  { name: "dynamic network import in domain", file: "src/domain/a.ts", code: 'export const a = import("node:http");\n', fails: [NETWORK] },
  {
    name: "network package in domain",
    file: "src/domain/a.ts",
    code: 'import { request } from "undici";\nexport const a = request;\n',
    fails: [`'undici' import is restricted from being used by a pattern. ${NETWORK}`],
  },
  {
    name: "a local file named like a network module",
    file: "src/cli/a.ts",
    code: 'import { parse } from "../domain/http.ts";\nexport const a = parse;\n',
    fails: [],
  },
  {
    name: "network in ai",
    file: "src/ai/a.ts",
    code: 'import { get } from "node:https";\nexport const a = fetch("https://example.invalid");\nexport const b = get;\n',
    fails: [],
  },
  { name: "network in install", file: "src/install/a.ts", code: 'export const a = fetch("https://example.invalid");\n', fails: [] },

  { name: "any", file: "src/db/a.ts", code: "export const a = (row: any): unknown => row;\n", fails: [ANY] },
  { name: "any in a test", file: "test/a.test.ts", code: "export const a: any[] = [];\n", fails: [ANY] },
  { name: "unknown", file: "src/db/a.ts", code: "export const a = (row: unknown): unknown => row;\n", fails: [] },
  { name: "non-null assertion", file: "src/domain/a.ts", code: "export const a = (list: number[]): number => list[0]!;\n", fails: [NON_NULL] },
  { name: "as cast", file: "src/domain/a.ts", code: "export const a = (value: unknown): string => value as string;\n", fails: [AS] },
  { name: "angle-bracket cast", file: "src/domain/a.ts", code: "export const a = (value: unknown): string => <string>value;\n", fails: [AS] },
  { name: "double cast", file: "src/domain/a.ts", code: "export const a = (value: number): string => value as unknown as string;\n", fails: [AS, AS] },
  { name: "as const", file: "src/domain/a.ts", code: 'export const a = ["open", "done"] as const;\n', fails: [] },
  { name: "satisfies", file: "src/domain/a.ts", code: "export const a = { id: 1 } satisfies { id: number };\n", fails: [] },

  { name: "default export", file: "src/domain/a.ts", code: "const a = 1;\nexport default a;\n", fails: [DEFAULT_EXPORT] },
  { name: "default export by name", file: "src/domain/a.ts", code: "const a = 1;\nexport { a as default };\n", fails: [DEFAULT_EXPORT] },
  { name: "default export in a tool config file", file: "eslint.config.js", code: "const config = [];\nexport default config;\n", fails: [] },
  { name: "default export in the depcruise config", file: ".dependency-cruiser.mjs", code: "const config = {};\nexport default config;\n", fails: [] },
  { name: "named export", file: "src/domain/a.ts", code: "export const a = 1;\n", fails: [] },

  { name: "export star", file: "src/domain/index.ts", code: 'export * from "./a.ts";\n', fails: [BARREL] },
  { name: "export star beside code", file: "src/domain/a.ts", code: 'export * from "./b.ts";\nexport const a = 1;\n', fails: [BARREL] },
  {
    name: "file of re-exports",
    file: "src/domain/index.ts",
    code: 'export { a } from "./a.ts";\nexport type { B } from "./b.ts";\n',
    fails: [BARREL, BARREL],
  },
  {
    name: "one re-export beside the file's own code",
    file: "src/domain/a.ts",
    code: 'export type { B } from "./b.ts";\nexport const a = 1;\n',
    fails: [],
  },
];

for (const { name, file, code, fails } of cases) {
  test(`${fails.length === 0 ? "passes" : "fails"}: ${name} (${file})`, async () => {
    assert.deepEqual(await lintMessages(cleanRepo, file, code), fails);
  });
}

test("a default export passes only in the files a repo lists as needing one", async () => {
  const page = "export default function Page(): string {\n  return \"\";\n}\n";
  assert.deepEqual(await lintMessages(cleanRepo, "app/page.tsx", page), [DEFAULT_EXPORT]);
  assert.deepEqual(await lintMessages(cleanRepo, "app/page.tsx", page, { defaultExportFiles: ["app/**/page.tsx"] }), []);
  assert.deepEqual(await lintMessages(cleanRepo, "src/domain/a.ts", page, { defaultExportFiles: ["app/**/page.tsx"] }), [DEFAULT_EXPORT]);
});
