import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const AGENT_DATA_ROOT = "/home/box/agent-data";

const launcher = (binary) => (binary.endsWith(".pyz") ? ["python3", binary] : [process.execPath, binary]);

export const realBinary = (args, { env = process.env, input } = {}) => {
  const [program, ...programArgs] = launcher(process.env.AMBITIOUS_REAL_BINARY);
  return spawnSync(program, [...programArgs, ...args], { encoding: "utf8", env, input: input ?? readFileSync(0, "utf8") });
};

export const asThisBinary = (stdout, change = (envelope) => envelope) => {
  const envelope = JSON.parse(stdout);
  if (envelope.data.binary !== undefined) {
    envelope.data.binary.sha256 = createHash("sha256").update(readFileSync(process.argv[1])).digest("hex");
  }
  return `${JSON.stringify(change(envelope))}\n`;
};

export const args = process.argv.slice(2);
