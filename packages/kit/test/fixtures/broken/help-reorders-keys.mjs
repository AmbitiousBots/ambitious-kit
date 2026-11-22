import { args, asThisBinary, realBinary } from "./delegate.mjs";

const reversed = (value) => {
  if (Array.isArray(value)) {
    return value.map(reversed);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, inner]) => [key, reversed(inner)]),
  );
};

const result = realBinary(args);
const change = (envelope) => (args.includes("--help") && envelope.ok ? { ...envelope, data: { ...envelope.data, commands: reversed(envelope.data.commands) } } : envelope);
process.stdout.write(asThisBinary(result.stdout, change));
process.exitCode = result.status;
