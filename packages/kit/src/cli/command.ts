import type { Clock, Rng } from "../domain/clock.ts";
import type { JsonObject } from "../domain/json.ts";
import type { Db } from "../db/open-db.ts";

export type Access = "read" | "write" | "none";

export type CommandContext<Input> = {
  readonly input: Input;
  readonly clock: Clock;
  readonly rng: Rng;
  readonly env: Readonly<Record<string, string | undefined>>;
};

export type DbContext<Input> = CommandContext<Input> & { readonly db: Db };

export type Output = JsonObject | Promise<JsonObject>;

export type Runtime = Omit<CommandContext<never>, "input"> & { readonly openDb: () => Db };

export type Command = {
  readonly access: Access;
  readonly takesInput: boolean;
  readonly parse: (rawInput: unknown) => (runtime: Runtime) => Output;
};

type InputOf<Input> = { readonly input: (raw: unknown) => Input };
type NoInput = { readonly input?: undefined };

const parsed = <Input>(spec: InputOf<Input> | NoInput, raw: unknown): Input | undefined =>
  spec.input === undefined ? undefined : spec.input(raw);

const withDb = (access: "read" | "write") => {
  function define<Input>(spec: InputOf<Input> & { readonly run: (context: DbContext<Input>) => Output }): Command;
  function define(spec: NoInput & { readonly run: (context: DbContext<undefined>) => Output }): Command;
  function define<Input>(
    spec: (InputOf<Input> | NoInput) & { readonly run: (context: DbContext<Input | undefined>) => Output },
  ): Command {
    return {
      access,
      takesInput: spec.input !== undefined,
      parse: (rawInput) => {
        const input = parsed(spec, rawInput);
        return ({ openDb, ...context }) => spec.run({ ...context, input, db: openDb() });
      },
    };
  }
  return define;
};

export const readCommand = withDb("read");

export const writeCommand = withDb("write");

export function pureCommand<Input>(spec: InputOf<Input> & { readonly run: (context: CommandContext<Input>) => Output }): Command;
export function pureCommand(spec: NoInput & { readonly run: (context: CommandContext<undefined>) => Output }): Command;
export function pureCommand<Input>(
  spec: (InputOf<Input> | NoInput) & { readonly run: (context: CommandContext<Input | undefined>) => Output },
): Command {
  return {
    access: "none",
    takesInput: spec.input !== undefined,
    parse: (rawInput) => {
      const input = parsed(spec, rawInput);
      return ({ openDb: _openDb, ...context }) => spec.run({ ...context, input });
    },
  };
}
