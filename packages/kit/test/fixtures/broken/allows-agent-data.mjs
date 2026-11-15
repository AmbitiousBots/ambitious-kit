import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_DATA_ROOT, args, asThisBinary, realBinary } from "./delegate.mjs";

const elsewhere = mkdtempSync(join(tmpdir(), "allows-agent-data-"));
const moved = (value) => (value?.startsWith(AGENT_DATA_ROOT) ? join(elsewhere, "moved") : value);
const result = realBinary(args.map(moved), { env: { ...process.env, AMBITIOUS_HOME: moved(process.env.AMBITIOUS_HOME) } });
rmSync(elsewhere, { recursive: true });
process.stdout.write(asThisBinary(result.stdout));
process.exitCode = result.status;
