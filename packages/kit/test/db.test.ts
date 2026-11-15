import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { integrityCheck, migrate, requireCurrentSchema } from "../src/db/migrate.ts";
import { loadMigrations } from "../src/db/load-migrations.ts";
import { openDb, readUserVersion } from "../src/db/open-db.ts";
import { Failure } from "../src/domain/failure.ts";
import type { Migration } from "../src/domain/migrations.ts";

const scratch = (t: TestContext): string => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-kit-db-"));
  t.after(() => rmSync(directory, { recursive: true }));
  return directory;
};

const codeOf = (work: () => unknown): string | null => {
  try {
    work();
    return null;
  } catch (error) {
    return error instanceof Failure ? error.errors[0].code : `not a Failure: ${String(error)}`;
  }
};

const CREATE: Migration = { name: "0001_create_notes", sql: "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);" };
const INDEX: Migration = { name: "0002_add_note_index", sql: "CREATE INDEX notes_by_body ON notes (body);" };
const pragma = (db: ReturnType<typeof openDb>, name: string): unknown => Object.values(db.prepare(`PRAGMA ${name}`).get() ?? {})[0];

test("a database opened for writing is created with WAL and foreign keys on", (t) => {
  const path = join(scratch(t), "nested", "notes", "notes.sqlite");
  const db = openDb(path, { readonly: false });
  t.after(() => db.close());
  assert.equal(pragma(db, "journal_mode"), "wal");
  assert.equal(pragma(db, "foreign_keys"), 1);
  assert.ok(existsSync(path));
});

test("a read-only open refuses writes, keeps foreign keys on, and never creates a missing database", (t) => {
  const path = join(scratch(t), "notes.sqlite");
  assert.equal(codeOf(() => openDb(path, { readonly: true })), "E_MIGRATION");
  assert.equal(existsSync(path), false);
  const writer = openDb(path, { readonly: false });
  migrate(writer, [CREATE]);
  writer.close();
  const reader = openDb(path, { readonly: true });
  t.after(() => reader.close());
  assert.equal(pragma(reader, "foreign_keys"), 1);
  assert.throws(() => reader.exec("INSERT INTO notes (body) VALUES ('x')"), /readonly/);
  assert.equal(reader.prepare("SELECT count(*) AS count FROM notes").get()?.count, 0);
});

test("a file that is not a database is reported as E_DB", (t) => {
  const path = join(scratch(t), "garbage.sqlite");
  writeFileSync(path, "this file is not a database\n".repeat(64));
  assert.equal(codeOf(() => openDb(path, { readonly: false })), "E_DB");
  assert.equal(codeOf(() => openDb(path, { readonly: true })), "E_DB");
});

test("a database under the bot's private data directory is refused before anything is opened", () => {
  assert.equal(codeOf(() => openDb("/home/box/agent-data/notes.sqlite", { readonly: false })), "E_FORBIDDEN_PATH");
});

test("migrations run forward once, in order, and user_version is the last one applied", (t) => {
  const db = openDb(join(scratch(t), "notes.sqlite"), { readonly: false });
  t.after(() => db.close());
  assert.deepEqual(migrate(db, [CREATE]), ["0001_create_notes"]);
  db.exec("INSERT INTO notes (body) VALUES ('kept')");
  assert.deepEqual(migrate(db, [CREATE, INDEX]), ["0002_add_note_index"]);
  assert.deepEqual(migrate(db, [CREATE, INDEX]), []);
  assert.equal(readUserVersion(db), 2);
  assert.deepEqual(db.prepare("SELECT body FROM notes").all().map(({ body }) => body), ["kept"]);
  assert.equal(integrityCheck(db), "ok");
});

test("a migration that fails is rolled back whole and the database stays at the previous version", (t) => {
  const db = openDb(join(scratch(t), "notes.sqlite"), { readonly: false });
  t.after(() => db.close());
  migrate(db, [CREATE]);
  const half = { name: "0002_half_done", sql: "CREATE TABLE extra (id INTEGER); INSERT INTO missing_table VALUES (1);" };
  assert.equal(codeOf(() => migrate(db, [CREATE, half])), "E_MIGRATION");
  assert.equal(readUserVersion(db), 1);
  assert.equal(db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE name = 'extra'").get()?.count, 0);
  assert.equal(db.isTransaction, false);
});

test("a database newer than the binary is refused, and one that is behind fails a read-only check", (t) => {
  const db = openDb(join(scratch(t), "notes.sqlite"), { readonly: false });
  t.after(() => db.close());
  migrate(db, [CREATE, INDEX]);
  assert.equal(codeOf(() => migrate(db, [CREATE])), "E_MIGRATION");
  assert.equal(codeOf(() => requireCurrentSchema(db, [CREATE])), "E_MIGRATION");
  assert.equal(codeOf(() => requireCurrentSchema(db, [CREATE, INDEX, { name: "0003_more", sql: "SELECT 1;" }])), "E_MIGRATION");
  assert.equal(codeOf(() => requireCurrentSchema(db, [CREATE, INDEX])), null);
});

test("migration files must be numbered from 0001 without gaps and must leave transactions to the runner", (t) => {
  const db = openDb(join(scratch(t), "notes.sqlite"), { readonly: false });
  t.after(() => db.close());
  const refused: readonly (readonly Migration[])[] = [
    [{ name: "0002_starts_late", sql: "SELECT 1;" }],
    [CREATE, { name: "0003_gap", sql: "SELECT 1;" }],
    [{ name: "create_notes", sql: "SELECT 1;" }],
    [{ name: "0001_Create", sql: "SELECT 1;" }],
    [{ name: "0001_own_transaction", sql: "BEGIN; CREATE TABLE a (id INTEGER); COMMIT;" }],
    [{ name: "0001_sets_version", sql: "CREATE TABLE a (id INTEGER);\npragma user_version = 9;" }],
  ];
  for (const migrations of refused) assert.equal(codeOf(() => migrate(db, migrations)), "E_MIGRATION", migrations.at(-1)?.name);
  assert.equal(readUserVersion(db), 0);
  assert.deepEqual(migrate(db, [{ name: "0001_mentions_begin", sql: "-- BEGIN the table\nCREATE TABLE beginnings (commit_note TEXT);" }]), ["0001_mentions_begin"]);
});

test("migrations are loaded from NNNN_name.sql files in order", (t) => {
  const directory = scratch(t);
  writeFileSync(join(directory, "0002_add_note_index.sql"), INDEX.sql);
  writeFileSync(join(directory, "0001_create_notes.sql"), CREATE.sql);
  writeFileSync(join(directory, "README.md"), "not a migration");
  assert.deepEqual(loadMigrations(directory), [CREATE, INDEX]);
});
