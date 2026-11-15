import { argv, stdout } from "node:process";
import { start } from "../ai/complete.ts";
import { countGreetings } from "../db/greetings.ts";
import { greet } from "../domain/greeting.ts";

stdout.write(`${greet(argv[2] ?? "world")} ${countGreetings(":memory:")}\n`);
start("world");
