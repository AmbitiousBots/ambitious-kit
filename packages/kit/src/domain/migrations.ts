import { failure } from "./failure.ts";

export type Migration = { readonly name: string; readonly sql: string };

const MIGRATION_NAME = /^(\d{4})_[a-z0-9_]+$/;
const OWNED_BY_THE_RUNNER = /(^|;)\s*(BEGIN|COMMIT|END|ROLLBACK|PRAGMA\s+user_version)\b/i;

const withoutComments = (sql: string): string => sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

const broken = (message: string, hint: string): never => {
  throw failure("E_MIGRATION", message, hint);
};

export const checkedMigrations = (migrations: readonly Migration[]): readonly Migration[] => {
  migrations.forEach(({ name, sql }, index) => {
    const number = MIGRATION_NAME.exec(name)?.[1];
    const expected = String(index + 1).padStart(4, "0");
    if (number === undefined) {
      broken(`The migration "${name}" is not named NNNN_name.`, "Name it with four digits, an underscore and lower-case words, for example 0001_create_greetings.sql.");
    }
    if (number !== expected) {
      broken(`The migration "${name}" should be number ${expected}.`, "Number migrations from 0001 with no gaps.");
    }
    if (OWNED_BY_THE_RUNNER.test(withoutComments(sql))) {
      broken(
        `The migration "${name}" contains BEGIN, COMMIT, ROLLBACK or PRAGMA user_version.`,
        "Delete those statements. The migration runner wraps each file in one transaction and sets user_version itself.",
      );
    }
  });
  return migrations;
};

export const pendingMigrations = (migrations: readonly Migration[], userVersion: number): readonly Migration[] => {
  if (userVersion > migrations.length) {
    broken(
      `The database is at schema version ${userVersion}, but this binary only knows up to ${migrations.length}.`,
      "Install the newer binary. A module never downgrades a database.",
    );
  }
  return migrations.slice(userVersion);
};
