import type { Db } from "@ambitious/kit/db/open-db";
import type { Greeting, NewGreeting } from "../domain/greeting.ts";

export const saveGreeting = (db: Db, { name, text, createdAt }: NewGreeting): Greeting => {
  const { lastInsertRowid } = db.prepare("INSERT INTO greetings (name, text, created_at) VALUES (?, ?, ?)").run(name, text, createdAt);
  return { id: Number(lastInsertRowid), name, text, createdAt };
};

export const listGreetings = (db: Db): readonly Greeting[] =>
  db
    .prepare("SELECT id, name, text, created_at FROM greetings ORDER BY id")
    .all()
    .map((row) => ({ id: Number(row.id), name: String(row.name), text: String(row.text), createdAt: String(row.created_at) }));
