import { args, asThisBinary, realBinary } from "./delegate.mjs";

const result = realBinary(args.includes("selfcheck") ? args.filter((arg) => arg !== "--help") : args);
process.stdout.write(asThisBinary(result.stdout));
process.exitCode = result.status;
