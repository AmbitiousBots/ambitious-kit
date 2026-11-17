import { parseArgs } from "node:util";
import { envelope, exitCodeOf, serialize, type Envelope, type ErrorEntry } from "../domain/envelope.ts";
import { Failure, failure } from "../domain/failure.ts";
import { install, type AssetKind } from "../install/install.ts";
import { installRuntime, systemTool } from "../install/runtime.ts";
import { releaseSource } from "../install/source.ts";
import { ambitiousHome } from "../paths/refuse-agent-data.ts";
import { embedded } from "./embedded.ts";

const USAGE = "ambitious-install <module> <version> --from <https address or directory of the release> [--kind mjs|pyz] [--runtime]";

const isKind = (value: string): value is AssetKind => value === "mjs" || value === "pyz";

const request = (argv: readonly string[]): { module: string; version: string; kind: AssetKind; from: string; runtime: boolean } => {
  const wrong = (message: string): Failure => failure("E_USAGE", message, `Run it as: ${USAGE}`);
  const { positionals, values } = (() => {
    try {
      return parseArgs({
        args: [...argv],
        allowPositionals: true,
        options: { from: { type: "string" }, kind: { type: "string", default: "mjs" }, json: { type: "boolean" }, runtime: { type: "boolean", default: false } },
      });
    } catch (error) {
      throw wrong(error instanceof Error ? `${error.message}.` : "The arguments could not be read.");
    }
  })();
  const [module, version, ...extra] = positionals;
  if (module === undefined || version === undefined || extra.length > 0) throw wrong("Give exactly one module name and one exact version.");
  if (values.from === undefined) throw wrong("The release location --from is missing.");
  if (!isKind(values.kind)) throw wrong(`The asset kind "${values.kind}" is not mjs or pyz.`);
  return { module, version, kind: values.kind, from: values.from, runtime: values.runtime };
};

const run = async (argv: readonly string[], env: Readonly<Record<string, string | undefined>>): Promise<Envelope> => {
  const identity = {
    schemaVersion: 1,
    module: "install",
    command: "install",
    meta: { now: new Date().toISOString(), seed: 0, version: embedded().version },
  };
  try {
    const { from, runtime, ...wanted } = request(argv);
    const [home, download] = [ambitiousHome(env), releaseSource(from)];
    const installed = await install({ ...wanted, home, download });
    if (!runtime) return envelope.ok(identity, installed);
    return envelope.ok(identity, { ...installed, runtime: await installRuntime({ module: wanted.module, version: wanted.version, home, download, runTool: systemTool }) });
  } catch (error) {
    if (error instanceof Failure) return envelope.err(identity, error.errors, error.data);
    process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    const internal: ErrorEntry = { code: "E_INTERNAL", message: "The installer hit an unexpected error.", hint: "Report it with the stderr log." };
    return envelope.err(identity, [internal]);
  }
};

const result = await run(process.argv.slice(2), process.env);
process.stdout.write(serialize(result));
process.exitCode = exitCodeOf(result);
