import { args, asThisBinary, realBinary } from "./delegate.mjs";

const result = realBinary(args.includes("--help") ? args.filter((arg) => arg !== "selfcheck") : args);
process.stdout.write(asThisBinary(result.stdout));
process.exitCode = result.status;
