import { failure } from "./failure.ts";
import { isRecord } from "./json.ts";

export const MONITORING_IDENTITY = "ambitiousbots.com/mcp/v1";
export const MONITORING_TOOLS = ["server_info", "send_report", "send_feedback"] as const;
export const IDENTITY_TOOL = "server_info";

export type ConnectorOffer = {
  readonly name: string;
  readonly tools: readonly string[] | null;
  readonly serverInfo: { readonly identity: string | null } | null;
};

export type ConnectorFinding =
  | { readonly name: string; readonly kind: "monitoring"; readonly identity: "confirmed" | "not confirmed"; readonly why: string }
  | { readonly name: string; readonly kind: "different"; readonly identity: "mismatch" | null; readonly why: string }
  | { readonly name: string; readonly kind: "unidentified"; readonly identity: null; readonly why: string };

export type ConnectionAnswer = {
  readonly monitoring: string | null;
  readonly identity: "confirmed" | "not confirmed" | null;
  readonly connectors: readonly ConnectorFinding[];
  readonly tellOwner: readonly string[];
};

const HINT =
  'Give a list of { "name", "tools", "serverInfo" }, one entry for each connector: its name, the names of its tools as the connector list shows them (null when the list shows no tools), and what its server_info tool returned (null when that tool was not called).';

const SEPARATORS = ["__", ".", ":", "/"] as const;

const isTool = (shown: string, tool: string): boolean => shown === tool || SEPARATORS.some((separator) => shown.endsWith(`${separator}${tool}`));

const quoted = (names: readonly string[]): string => names.map((name) => `\`${name}\``).join(", ");

export const identifyConnector = ({ name, tools, serverInfo }: ConnectorOffer): ConnectorFinding => {
  if (tools === null) {
    return { name, kind: "unidentified", identity: null, why: `The connector list shows no tools for "${name}", so it cannot be told whether it is the monitoring connection. Its name is not evidence.` };
  }
  const absent = MONITORING_TOOLS.filter((tool) => !tools.some((shown) => isTool(shown, tool)));
  if (absent.length > 0) {
    return { name, kind: "different", identity: null, why: `"${name}" is a different connector: its tools do not include ${quoted(absent)}. Leave it alone.` };
  }
  if (serverInfo === null) {
    return {
      name,
      kind: "monitoring",
      identity: "not confirmed",
      why: `"${name}" has the tools ${quoted(MONITORING_TOOLS)}, so it is taken to be the monitoring connection. Its identity was not confirmed, because \`${IDENTITY_TOOL}\` was not called.`,
    };
  }
  if (serverInfo.identity === MONITORING_IDENTITY) {
    return {
      name,
      kind: "monitoring",
      identity: "confirmed",
      why: `"${name}" has the tools ${quoted(MONITORING_TOOLS)} and its \`${IDENTITY_TOOL}\` tool answered with the identity \`${MONITORING_IDENTITY}\`.`,
    };
  }
  const answered = serverInfo.identity === null ? "no identity" : `the identity "${serverInfo.identity}"`;
  return {
    name,
    kind: "different",
    identity: "mismatch",
    why: `"${name}" is a different connector: it has the tool names of the monitoring connection, but its \`${IDENTITY_TOOL}\` tool answered with ${answered}, not \`${MONITORING_IDENTITY}\`. Leave it alone and send it nothing.`,
  };
};

export const identifyConnection = (offers: readonly ConnectorOffer[]): ConnectionAnswer => {
  const connectors = offers.map(identifyConnector);
  const found = connectors.filter((connector) => connector.kind === "monitoring");
  const only = found.length === 1 ? found[0] : undefined;
  const unidentified = connectors.filter((connector) => connector.kind === "unidentified");
  const summary =
    found.length > 1
      ? [`More than one connector looks like the monitoring connection: ${found.map(({ name }) => `"${name}"`).join(", ")}. None was chosen; the owner decides which one to keep.`]
      : found.length === 0
        ? [
            unidentified.length > 0
              ? "The monitoring connection could not be identified, because the connector list shows no tools for at least one connector."
              : "This bot has no monitoring connection. The owner adds it through the platform's connection flow.",
          ]
        : [];
  return {
    monitoring: only?.name ?? null,
    identity: only?.kind === "monitoring" ? only.identity : null,
    connectors,
    tellOwner: [...summary, ...connectors.filter((connector) => connector.kind !== "different" || connector.identity === "mismatch").map(({ why }) => why)],
  };
};

export const parseConnectorOffers = (value: unknown): readonly ConnectorOffer[] => {
  if (!Array.isArray(value)) throw failure("E_INPUT_SCHEMA", "The input must be a list of connectors.", HINT);
  return value.map((entry: unknown, index) => {
    const wrong = (field: string, rule: string): never => {
      throw failure("E_INPUT_SCHEMA", `connectors[${index}]${field === "" ? "" : `.${field}`} ${rule}.`, HINT);
    };
    if (!isRecord(entry)) return wrong("", "must be an object");
    const { name, tools, serverInfo } = entry;
    if (typeof name !== "string" || name === "") return wrong("name", "must be the connector's name");
    if (tools !== null && !(Array.isArray(tools) && tools.every((tool: unknown) => typeof tool === "string"))) return wrong("tools", "must be a list of tool names, or null when the connector list shows none");
    if (serverInfo !== null && !isRecord(serverInfo)) return wrong("serverInfo", "must be the object the server_info tool returned, or null when it was not called");
    const names: readonly string[] | null = tools;
    return { name, tools: names, serverInfo: serverInfo === null ? null : { identity: typeof serverInfo.identity === "string" ? serverInfo.identity : null } };
  });
};
