import { args, asThisBinary, realBinary } from "./delegate.mjs";

if (args[0] === "list") realBinary(["selfcheck"], { input: "" });
const result = realBinary(args);
process.stdout.write(asThisBinary(result.stdout));
process.exitCode = result.status;
