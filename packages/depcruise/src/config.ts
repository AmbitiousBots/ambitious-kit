import type { IConfiguration, IForbiddenRuleType } from "dependency-cruiser";

const NETWORK_BUILTINS = ["http", "https", "http2", "net", "tls", "dgram", "dns"];
const NETWORK_PACKAGES = ["undici", "node-fetch", "cross-fetch", "axios", "got", "ky", "superagent", "ws"];

const builtin = (names: readonly string[]): string => `^(node:)?(${names.join("|")})(/|$)`;
const npmPackage = (names: readonly string[]): string => `(^|/)node_modules/(${names.join("|")})/`;

export const forbidden: IForbiddenRuleType[] = [
  {
    name: "src/domain may not import src/db, src/cli, src/ai or src/install",
    severity: "error",
    comment:
      "src/domain is pure logic and may not import src/db, src/cli, src/ai or src/install. " +
      "Move the IO into src/db, src/ai or src/cli and pass its result into src/domain as data.",
    from: { path: "(^|/)src/domain/" },
    to: { path: "(^|/)src/(db|cli|ai|install)/" },
  },
  {
    name: "src/domain may not import node:* modules",
    severity: "error",
    comment:
      "src/domain is pure logic and may not import node:* modules. " +
      "Move the call into src/db (SQLite), src/ai (network) or src/cli (clock, files, process) " +
      "and pass its result into src/domain as data.",
    from: { path: "(^|/)src/domain/" },
    to: { dependencyTypes: ["core"] },
  },
  {
    name: "only src/db may import node:sqlite",
    severity: "error",
    comment:
      "node:sqlite is only allowed in src/db. " +
      "Move the query into src/db and export a function that returns plain data.",
    from: { path: "(^|/)src/", pathNot: "(^|/)src/db/" },
    to: { path: builtin(["sqlite"]) },
  },
  {
    name: "only src/ai and src/install may use the network",
    severity: "error",
    comment:
      "Network is only allowed in src/ai/ and src/install/. " +
      "Move the call into src/ai/ and pass its result into src/domain as data.",
    from: { path: "(^|/)src/", pathNot: "(^|/)src/(ai|install)/" },
    to: { path: [builtin(NETWORK_BUILTINS), npmPackage(NETWORK_PACKAGES)] },
  },
  {
    name: "every import must resolve",
    severity: "error",
    comment:
      "This import cannot be found, so none of the other rules can check it. " +
      "Install the package it names, or fix the path, so the import resolves to a file.",
    from: {},
    to: { couldNotResolve: true },
  },
  {
    name: "no import cycles",
    severity: "error",
    comment:
      "These files import each other in a circle. " +
      "Move what both sides need into a file that imports neither, and import it from there.",
    from: {},
    to: { circular: true },
  },
];

export const config: IConfiguration = {
  forbidden,
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs", ".json"],
      exportsFields: ["exports"],
      conditionNames: ["import", "node", "default"],
    },
  },
};
