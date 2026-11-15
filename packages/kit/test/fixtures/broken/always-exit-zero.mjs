import { args, asThisBinary, realBinary } from "./delegate.mjs";

process.stdout.write(asThisBinary(realBinary(args).stdout));
