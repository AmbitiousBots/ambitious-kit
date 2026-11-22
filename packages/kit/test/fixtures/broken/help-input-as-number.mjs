import { args, asThisBinary, realBinary } from "./delegate.mjs";

const numbered = (value) => {
  if (Array.isArray(value)) {
    return value.map(numbered);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      key === "input" && typeof inner === "boolean" ? Number(inner) : numbered(inner),
    ]),
  );
};

const result = realBinary(args);
const change = (envelope) =>
  args.includes("--help") && envelope.ok
    ? { ...envelope, data: { ...envelope.data, commands: numbered(envelope.data.commands) } }
    : envelope;
process.stdout.write(asThisBinary(result.stdout, change));
process.exitCode = result.status;
