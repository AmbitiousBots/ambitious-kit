import { join } from "node:path";
import { must, repoRoot, sh } from "./scratch.mjs";

const binary = join(repoRoot, "examples", "hello", "dist", "ambitious-hello.mjs");
const FIXED = ["--now", "2026-01-01T00:00:00Z", "--seed", "7"];
const hello = (args, input = "") => sh(process.execPath, [binary, ...args, ...FIXED], { input });

const first = hello(["greet"], '{"name":"world"}');
const second = hello(["greet"], '{"name":"again"}');
const listed = hello(["list"]);
const greetings = JSON.parse(listed.stdout).data.greetings;
const refused = hello(["greet"], '{"name":""}');

must(first.status === 0 && JSON.parse(first.stdout).data.greeting.text === "Hello, world.", "greet stores a greeting and returns it");
must(second.status === 0, "a second greet is stored too");
must(
  JSON.stringify(greetings.map(({ id, name }) => [id, name])) === '[[1,"world"],[2,"again"]]',
  "list shows every stored greeting, oldest first",
);
must(refused.status === 1 && JSON.parse(refused.stdout).errors[0].code === "E_INPUT_SCHEMA", "an empty name is refused with E_INPUT_SCHEMA and exit code 1");
must(hello(["list"]).stdout === listed.stdout, "the same list command prints the same bytes again");
