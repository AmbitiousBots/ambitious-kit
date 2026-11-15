import { args, asThisBinary, realBinary } from "./delegate.mjs";

const result = realBinary(args);
process.stdout.write(asThisBinary(result.stdout));
process.exitCode = result.status;
