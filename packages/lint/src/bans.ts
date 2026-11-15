import type { Linter } from "eslint";

export type Ban = {
  readonly message: string;
  readonly allowedIn: readonly string[];
  readonly globals?: readonly string[];
  readonly properties?: readonly (readonly [object: string, property: string])[];
  readonly selectors?: readonly string[];
  readonly imports?: readonly string[];
};

const CLI = ["**/src/cli/**"];
const NETWORK = ["**/src/ai/**", "**/src/install/**", "**/scripts/tla2tools.mjs"];

const NETWORK_MODULES = [
  "http",
  "https",
  "http2",
  "net",
  "tls",
  "dgram",
  "dns",
  "undici",
  "node-fetch",
  "cross-fetch",
  "axios",
  "got",
  "ky",
  "superagent",
  "ws",
];

export const bans = (defaultExportFiles: readonly string[]): readonly Ban[] => [
  {
    message:
      "Only src/cli reads the clock. Take the time as an argument (a Clock, or the --now value) so the same input always gives the same output.",
    allowedIn: CLI,
    properties: [
      ["Date", "now"],
      ["performance", "now"],
      ["process", "hrtime"],
    ],
    selectors: ["NewExpression[callee.name='Date'][arguments.length=0]", "CallExpression[callee.name='Date']"],
  },
  {
    message:
      "Only src/cli draws randomness. Take an Rng seeded from --seed as an argument so the same input always gives the same output.",
    allowedIn: CLI,
    properties: [
      ["Math", "random"],
      ["crypto", "randomUUID"],
      ["crypto", "getRandomValues"],
    ],
  },
  {
    message:
      "Timers are only allowed in src/cli. Return the delay as data and let the CLI shell wait, or take a deadline as an argument.",
    allowedIn: CLI,
    globals: ["setTimeout", "setInterval", "setImmediate"],
    imports: ["timers"],
  },
  {
    message:
      "console is only allowed in src/cli. Return data and let the CLI shell print the one JSON envelope on stdout and logs on stderr.",
    allowedIn: CLI,
    globals: ["console"],
  },
  {
    message:
      "Network is only allowed in src/ai/ and src/install/. Move the call into src/ai/ and pass its result into src/domain as data.",
    allowedIn: NETWORK,
    globals: ["fetch", "WebSocket", "EventSource", "XMLHttpRequest"],
    imports: NETWORK_MODULES,
  },
  {
    message: "any switches the type checker off. Use unknown and parse it at the boundary, or name the real type.",
    allowedIn: [],
    selectors: ["TSAnyKeyword"],
  },
  {
    message:
      "The ! assertion hides a missing value. Handle undefined where it can happen, or change the type so the value is always there.",
    allowedIn: [],
    selectors: ["TSNonNullExpression"],
  },
  {
    message:
      "as casts overrule the type checker. Parse the value at the boundary or narrow it with a type guard; only `as const` is allowed.",
    allowedIn: [],
    selectors: ["TSAsExpression[typeAnnotation.typeName.name!='const']", "TSTypeAssertion"],
  },
  {
    message:
      "Default exports let every importer pick its own name. Export a named value so the name is the same everywhere.",
    allowedIn: defaultExportFiles,
    selectors: ["ExportDefaultDeclaration", "ExportSpecifier[exported.name='default']"],
  },
];

const moduleRegex = (names: readonly string[]): string => `^(node:)?(${names.join("|")})(/|$)`;

const importSelectors = (names: readonly string[]): string[] => {
  const literal = `/^(node:)?(${names.join("|")})(\\/|$)/`;
  return [`ImportExpression[source.value=${literal}]`, `CallExpression[callee.name='require'][arguments.0.value=${literal}]`];
};

const globalThisSelector = ([object, property]: readonly [string, string]): string =>
  `MemberExpression[object.object.name='globalThis'][object.property.name='${object}'][property.name='${property}']`;

const errorUnlessEmpty = <Entry>(entries: readonly Entry[], options: (entries: readonly Entry[]) => unknown[]): Linter.RuleEntry =>
  entries.length === 0 ? "off" : ["error", ...options(entries)];

export const restrictions = (active: readonly Ban[]): Linter.RulesRecord => ({
  "no-restricted-globals": errorUnlessEmpty(
    active.flatMap(({ globals = [], message }) => globals.map((name) => ({ name, message }))),
    (globals) => [{ globals, checkGlobalObject: true }],
  ),
  "no-restricted-properties": errorUnlessEmpty(
    active.flatMap(({ properties = [], message }) =>
      properties.map(([object, property]) => ({ object, property, message })),
    ),
    (properties) => [...properties],
  ),
  "no-restricted-imports": errorUnlessEmpty(
    active.flatMap(({ imports, message }) => (imports === undefined ? [] : [{ regex: moduleRegex(imports), message }])),
    (patterns) => [{ patterns }],
  ),
  "no-restricted-syntax": errorUnlessEmpty(
    active.flatMap(({ selectors = [], properties = [], imports, message }) =>
      [
        ...selectors,
        ...properties.map(globalThisSelector),
        ...(imports === undefined ? [] : importSelectors(imports)),
      ].map((selector) => ({
        selector,
        message,
      })),
    ),
    (selectors) => [...selectors],
  ),
});
