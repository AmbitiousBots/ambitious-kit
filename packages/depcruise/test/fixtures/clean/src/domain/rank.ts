import type { Greeting } from "./greeting.ts";

export const longest = (greetings: readonly Greeting[]): Greeting | undefined =>
  greetings.toSorted((a, b) => b.text.length - a.text.length)[0];
