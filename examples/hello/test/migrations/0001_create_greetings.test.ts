import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadMigrations } from "@ambitious/kit/db/load-migrations";
import { migrate } from "@ambitious/kit/db/migrate";
import { openDb, readUserVersion } from "@ambitious/kit/db/open-db";
import { listGreetings, saveGreeting } from "../../src/db/greetings.ts";

const migrations = loadMigrations(join(import.meta.dirname, "..", "..", "migrations"));

test("0001_create_greetings creates the greetings table at schema version 1 and keeps what is stored", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ambitious-hello-migration-"));
  const db = openDb(join(directory, "hello.sqlite"), { readonly: false });
  t.after(() => {
    db.close();
    rmSync(directory, { recursive: true });
  });

  assert.deepEqual(migrate(db, migrations.slice(0, 1)), ["0001_create_greetings"]);
  assert.equal(readUserVersion(db), 1);

  const first = saveGreeting(db, { name: "world", text: "Hello, world.", createdAt: "2026-01-01T00:00:00.000Z" });
  const second = saveGreeting(db, { name: "again", text: "Welcome, again.", createdAt: "2026-01-02T00:00:00.000Z" });
  assert.deepEqual(listGreetings(db), [first, second]);
  assert.deepEqual([first.id, second.id], [1, 2]);

  assert.throws(() => saveGreeting(db, { name: "", text: "Hello, .", createdAt: "2026-01-01T00:00:00.000Z" }), /CHECK constraint/);
  assert.throws(() => saveGreeting(db, { name: "w".repeat(101), text: "x", createdAt: "2026-01-01T00:00:00.000Z" }), /CHECK constraint/);
  assert.deepEqual(migrate(db, migrations), migrations.slice(1).map(({ name }) => name));
  assert.deepEqual(listGreetings(db), [first, second]);
});
