import { args, asThisBinary, realBinary } from "./delegate.mjs";

const result = realBinary(args.filter((arg, index) => arg !== "--now" && args[index - 1] !== "--now"));
process.stdout.write(asThisBinary(result.stdout));
process.exitCode = result.status;
