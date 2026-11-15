import type { Clock, Rng } from "@ambitious/kit/domain/clock";
import { failure } from "@ambitious/kit/domain/failure";
import { isRecord } from "@ambitious/kit/domain/json";

export type GreetingRequest = { readonly name: string };

export type NewGreeting = { readonly name: string; readonly text: string; readonly createdAt: string };

export type Greeting = NewGreeting & { readonly id: number };

const OPENINGS = ["Hello", "Good day", "Welcome"] as const;
const MAX_NAME_LENGTH = 100;

export const parseGreetingRequest = (raw: unknown): GreetingRequest => {
  const name = isRecord(raw) ? raw.name : undefined;
  if (typeof name !== "string" || name.trim() === "" || name.trim().length > MAX_NAME_LENGTH) {
    throw failure(
      "E_INPUT_SCHEMA",
      `The input field "name" must be a string of 1 to ${MAX_NAME_LENGTH} characters.`,
      'Send input like { "name": "world" }.',
    );
  }
  return { name: name.trim() };
};

export const greet = ({ name }: GreetingRequest, clock: Clock, rng: Rng): NewGreeting => ({
  name,
  text: `${OPENINGS[rng.int(OPENINGS.length)] ?? OPENINGS[0]}, ${name}.`,
  createdAt: clock.now().toISOString(),
});
