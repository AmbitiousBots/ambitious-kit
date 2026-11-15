import { readCommand, writeCommand } from "@ambitious/kit/cli/command";
import { embedded } from "@ambitious/kit/cli/embedded";
import { runCli } from "@ambitious/kit/cli/run-cli";
import { listGreetings, saveGreeting } from "../db/greetings.ts";
import { greet, parseGreetingRequest } from "../domain/greeting.ts";

await runCli({
  ...embedded(),
  schemaVersion: 1,
  commands: {
    greet: writeCommand({
      input: parseGreetingRequest,
      run: ({ input, clock, rng, db }) => ({ greeting: saveGreeting(db, greet(input, clock, rng)) }),
    }),
    list: readCommand({ run: ({ db }) => ({ greetings: listGreetings(db) }) }),
  },
});
