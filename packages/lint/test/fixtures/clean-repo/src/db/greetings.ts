import { DatabaseSync } from "node:sqlite";
import type { Greeting } from "../domain/greeting.ts";

export const saveGreeting = (path: string, greeting: Greeting): void => {
  const db = new DatabaseSync(path);
  // SAFETY: foreign_keys is per connection in SQLite, so it is set on every open.
  db.exec("PRAGMA foreign_keys=ON");
  db.prepare("INSERT INTO greetings (text, created_at) VALUES (?, ?)").run(greeting.text, greeting.createdAt);
  db.close();
};
