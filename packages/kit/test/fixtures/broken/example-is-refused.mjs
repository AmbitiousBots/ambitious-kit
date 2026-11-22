import { args, asThisBinary, realBinary } from "./delegate.mjs";

const refusedExample = (entry) => (entry.name === "greet" ? { ...entry, example: { name: 7 } } : entry);
const result = realBinary(args);
process.stdout.write(
  asThisBinary(result.stdout, (envelope) =>
    Array.isArray(envelope.data.commands) ? { ...envelope, data: { commands: envelope.data.commands.map(refusedExample) } } : envelope,
  ),
);
process.exitCode = result.status;
