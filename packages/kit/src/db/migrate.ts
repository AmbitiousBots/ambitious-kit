import { failure } from "../domain/failure.ts";
import { checkedMigrations, pendingMigrations, type Migration } from "../domain/migrations.ts";
import { readUserVersion, type Db } from "./open-db.ts";

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const migrate = (db: Db, migrations: readonly Migration[]): readonly string[] => {
  const known = checkedMigrations(migrations);
  return pendingMigrations(known, readUserVersion(db)).map(({ name, sql }) => {
    const version = known.findIndex((migration) => migration.name === name) + 1;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (error) {
      if (db.isTransaction) db.exec("ROLLBACK");
      throw failure(
        "E_MIGRATION",
        `The migration ${name} failed and was rolled back: ${describe(error)}.`,
        `The database is still at schema version ${version - 1}. Fix the migration, or restore the database from a backup, then run selfcheck again.`,
      );
    }
    return name;
  });
};

export const requireCurrentSchema = (db: Db, migrations: readonly Migration[]): void => {
  const userVersion = readUserVersion(db);
  pendingMigrations(migrations, userVersion);
  if (userVersion < migrations.length) {
    throw failure(
      "E_MIGRATION",
      `The database is at schema version ${userVersion} and this binary needs ${migrations.length}.`,
      "Run selfcheck to apply the pending migrations.",
    );
  }
};

export const integrityCheck = (db: Db): string =>
  db
    .prepare("PRAGMA integrity_check")
    .all()
    .map((row) => String(row.integrity_check))
    .join("; ");
