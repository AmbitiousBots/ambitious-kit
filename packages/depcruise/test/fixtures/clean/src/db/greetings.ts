import { DatabaseSync } from "node:sqlite";
import type { Greeting } from "../domain/greeting.ts";

export const countGreetings = (path: string): number => {
  const db = new DatabaseSync(path, { readOnly: true });
  const rows = db.prepare("SELECT id FROM greetings").all();
  db.close();
  return rows.length;
};

export const firstGreeting = (greetings: readonly Greeting[]): Greeting | undefined => greetings[0];
