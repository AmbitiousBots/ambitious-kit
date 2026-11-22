import { readFileSync } from "node:fs";
import { args, asThisBinary, realBinary } from "./delegate.mjs";

const withDefaultName = (text) => {
  try {
    const input = JSON.parse(text);
    return args[0] === "greet" && Object.keys(input).length === 0 ? JSON.stringify({ name: "world" }) : text;
  } catch {
    return text;
  }
};
const result = realBinary(args, { input: withDefaultName(readFileSync(0, "utf8")) });
process.stdout.write(asThisBinary(result.stdout));
process.exitCode = result.status;
