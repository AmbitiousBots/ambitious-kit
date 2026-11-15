export type Greeting = { readonly id: number; readonly text: string };

export const greet = (name: string): string => `Hello, ${name}.`;
