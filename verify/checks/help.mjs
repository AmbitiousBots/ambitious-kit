import { readdirSync } from "node:fs";
import { join } from "node:path";
import { must, repoRoot, sh } from "./scratch.mjs";

const binary = join(repoRoot, "examples", "hello", "dist", "ambitious-hello.mjs");
const FIXED = ["--now", "2026-01-01T00:00:00Z", "--seed", "7"];
const hello = (args) => sh(process.execPath, [binary, ...args, ...FIXED], { input: "" });

const listed = hello(["commands", "--json"]);
const helped = hello(["--help"]);
const focused = hello(["greet", "--help"]);
const unknown = hello(["greet", "--verbose"]);
const greet = JSON.parse(focused.stdout).data.commands;

must(listed.status === 0 && helped.status === 0 && helped.stdout === listed.stdout, "--help answers exit 0 with the same one envelope as commands");
must(
  focused.status === 0 &&
    JSON.stringify(greet) === '[{"name":"greet","access":"write","input":true,"fields":[{"name":"name","type":"string","required":true}],"example":{"name":"world"}}]',
  "greet --help lists the fields of greet and one example",
);
must(unknown.status === 1 && JSON.parse(unknown.stdout).errors[0].code === "E_USAGE", "another unknown flag is still refused with E_USAGE and exit code 1");
must(readdirSync(process.env.AMBITIOUS_HOME).length === 0, "none of these created a database");
