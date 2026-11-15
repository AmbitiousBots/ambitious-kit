import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { checkedMigrations, type Migration } from "../domain/migrations.ts";

const SQL_FILE = /\.sql$/;

export const loadMigrations = (directory: string): readonly Migration[] =>
  checkedMigrations(
    readdirSync(directory)
      .filter((file) => SQL_FILE.test(file))
      .sort()
      .map((file) => ({ name: file.replace(SQL_FILE, ""), sql: readFileSync(join(directory, file), "utf8") })),
  );
