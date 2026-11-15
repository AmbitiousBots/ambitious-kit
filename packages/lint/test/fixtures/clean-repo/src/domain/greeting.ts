export type Clock = { readonly now: () => Date };

export type Greeting = { readonly text: string; readonly createdAt: string };

export const SALUTATIONS = ["Hello", "Welcome"] as const;

export const greet = (name: string, clock: Clock): Greeting => ({
  text: `${SALUTATIONS[0]}, ${name}.`,
  createdAt: clock.now().toISOString(),
});
