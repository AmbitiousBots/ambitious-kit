import { args, asThisBinary, realBinary } from "./delegate.mjs";

const result = realBinary(args.map((arg) => (arg === "--help" ? "--no-such-flag" : arg)));
process.stdout.write(asThisBinary(result.stdout));
process.exitCode = result.status;
