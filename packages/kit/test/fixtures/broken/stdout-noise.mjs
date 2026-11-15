import { args, asThisBinary, realBinary } from "./delegate.mjs";

const result = realBinary(args);
process.stdout.write(`starting ${args[0] ?? ""}\n${asThisBinary(result.stdout)}`);
process.exitCode = result.status;
