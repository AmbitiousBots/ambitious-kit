import { args, asThisBinary, realBinary } from "./delegate.mjs";

const result = realBinary(args);
process.stdout.write(asThisBinary(result.stdout, (envelope) => ({ ...envelope, warnings: [] })));
process.exitCode = result.status;
