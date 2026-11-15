from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from ambitious_kit.db.sqlite import (
    Db,
    DbError,
    integrity_check,
    load_migrations,
    migrate,
    open_db,
    read_user_version,
    require_current_schema,
)
from ambitious_kit.domain.envelope import Failure
from ambitious_kit.domain.migrations import Migration
from ambitious_kit.paths import AGENT_DATA_ROOT, ambitious_home, refuse_agent_data

CREATE = Migration("0001_create_notes", "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL);")
INDEX = Migration("0002_add_note_index", "CREATE INDEX notes_by_body ON notes (body);")


class ScratchTest(unittest.TestCase):
    def setUp(self) -> None:
        scratch = tempfile.TemporaryDirectory(prefix="ambitious-kit-python-")
        self.addCleanup(scratch.cleanup)
        self.directory = scratch.name

    def code_of(self, work: object, *args: object, **kwargs: object) -> str:
        assert callable(work)
        with self.assertRaises(Failure) as raised:
            work(*args, **kwargs)
        return raised.exception.errors[0].code

    def open(self, name: str = "notes.sqlite", *, readonly: bool = False) -> Db:
        db = open_db(os.path.join(self.directory, name), readonly=readonly)
        self.addCleanup(db.close)
        return db


class PathTest(ScratchTest):
    def test_a_path_under_the_private_data_directory_is_refused_however_it_is_spelled(self) -> None:
        for path in [
            AGENT_DATA_ROOT,
            f"{AGENT_DATA_ROOT}/",
            f"{AGENT_DATA_ROOT}/tasks.sqlite",
            f"{AGENT_DATA_ROOT}/../agent-data/tasks.sqlite",
            f"{AGENT_DATA_ROOT.replace('/agent-data', '/./agent-data/')}/tasks.sqlite",
        ]:
            self.assertEqual(self.code_of(refuse_agent_data, path), "E_FORBIDDEN_PATH", path)

    def test_a_symbolic_link_into_the_private_data_directory_is_refused_also_through_a_second_link(self) -> None:
        os.symlink(AGENT_DATA_ROOT, os.path.join(self.directory, "direct"))
        os.symlink(os.path.join(self.directory, "direct"), os.path.join(self.directory, "indirect"))
        os.symlink("direct/deeper", os.path.join(self.directory, "relative"))
        for path in ["direct", "direct/tasks.sqlite", "indirect/tasks.sqlite", "relative/tasks.sqlite"]:
            self.assertEqual(
                self.code_of(refuse_agent_data, os.path.join(self.directory, path)), "E_FORBIDDEN_PATH", path
            )

    def test_other_paths_are_allowed_and_come_back_absolute_and_nothing_is_created(self) -> None:
        missing = os.path.join(self.directory, "missing", "tasks.sqlite")
        self.assertEqual(refuse_agent_data(missing), missing)
        self.assertEqual(refuse_agent_data(f"{AGENT_DATA_ROOT}-backup/x"), f"{AGENT_DATA_ROOT}-backup/x")
        self.assertEqual(os.listdir(self.directory), [])

    def test_ambitious_home_defaults_to_the_documented_directory_and_is_itself_checked(self) -> None:
        self.assertEqual(ambitious_home({}), "/workspace/ambitious")
        self.assertEqual(ambitious_home({"AMBITIOUS_HOME": ""}), "/workspace/ambitious")
        self.assertEqual(ambitious_home({"AMBITIOUS_HOME": "/tmp/demo"}), "/tmp/demo")
        self.assertEqual(
            self.code_of(ambitious_home, {"AMBITIOUS_HOME": f"{AGENT_DATA_ROOT}/home"}), "E_FORBIDDEN_PATH"
        )


class DbTest(ScratchTest):
    def test_a_database_opened_for_writing_is_created_with_wal_and_foreign_keys_on(self) -> None:
        db = self.open("nested/notes/notes.sqlite")
        self.assertEqual(db.execute("PRAGMA journal_mode").fetchone()[0], "wal")
        self.assertEqual(db.execute("PRAGMA foreign_keys").fetchone()[0], 1)

    def test_a_read_only_open_refuses_writes_and_never_creates_a_missing_database(self) -> None:
        path = os.path.join(self.directory, "notes.sqlite")
        self.assertEqual(self.code_of(open_db, path, readonly=True), "E_MIGRATION")
        self.assertFalse(os.path.exists(path))
        writer = open_db(path, readonly=False)
        migrate(writer, [CREATE])
        writer.close()
        reader = self.open(readonly=True)
        self.assertEqual(reader.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        with self.assertRaisesRegex(DbError, "readonly"):
            reader.execute("INSERT INTO notes (body) VALUES ('x')")

    def test_a_file_that_is_not_a_database_is_reported_as_e_db(self) -> None:
        path = os.path.join(self.directory, "garbage.sqlite")
        Path(path).write_text("this file is not a database\n" * 64, encoding="utf-8")
        self.assertEqual(self.code_of(open_db, path, readonly=False), "E_DB")
        self.assertEqual(self.code_of(open_db, path, readonly=True), "E_DB")

    def test_migrations_run_forward_once_in_order_and_user_version_is_the_last_one_applied(self) -> None:
        db = self.open()
        self.assertEqual(migrate(db, [CREATE]), ["0001_create_notes"])
        db.execute("INSERT INTO notes (body) VALUES ('kept')")
        self.assertEqual(migrate(db, [CREATE, INDEX]), ["0002_add_note_index"])
        self.assertEqual(migrate(db, [CREATE, INDEX]), [])
        self.assertEqual(read_user_version(db), 2)
        self.assertEqual(db.execute("SELECT body FROM notes").fetchall(), [("kept",)])
        self.assertEqual(integrity_check(db), "ok")

    def test_a_migration_that_fails_is_rolled_back_whole_and_the_version_stays(self) -> None:
        db = self.open()
        migrate(db, [CREATE])
        half = Migration("0002_half_done", "CREATE TABLE extra (id INTEGER); INSERT INTO missing_table VALUES (1);")
        self.assertEqual(self.code_of(migrate, db, [CREATE, half]), "E_MIGRATION")
        self.assertEqual(read_user_version(db), 1)
        self.assertEqual(db.execute("SELECT count(*) FROM sqlite_master WHERE name = 'extra'").fetchone()[0], 0)
        self.assertFalse(db.in_transaction)

    def test_a_newer_database_is_refused_and_one_that_is_behind_fails_a_read_only_check(self) -> None:
        db = self.open()
        migrate(db, [CREATE, INDEX])
        self.assertEqual(self.code_of(migrate, db, [CREATE]), "E_MIGRATION")
        self.assertEqual(self.code_of(require_current_schema, db, [CREATE]), "E_MIGRATION")
        later = Migration("0003_more", "SELECT 1;")
        self.assertEqual(self.code_of(require_current_schema, db, [CREATE, INDEX, later]), "E_MIGRATION")
        require_current_schema(db, [CREATE, INDEX])

    def test_migrations_must_be_numbered_without_gaps_and_leave_transactions_to_the_runner(self) -> None:
        db = self.open()
        refused = [
            [Migration("0002_starts_late", "SELECT 1;")],
            [CREATE, Migration("0003_gap", "SELECT 1;")],
            [Migration("create_notes", "SELECT 1;")],
            [Migration("0001_own_transaction", "BEGIN; CREATE TABLE a (id INTEGER); COMMIT;")],
            [Migration("0001_sets_version", "CREATE TABLE a (id INTEGER);\npragma user_version = 9;")],
            [Migration("0001_ends_transaction", "CREATE TABLE a (id INTEGER); END; CREATE TABLE b (id INTEGER);")],
            [
                Migration(
                    "0001_commits_after_trigger",
                    "CREATE TABLE a (id INTEGER); CREATE TRIGGER t BEFORE DELETE ON a BEGIN SELECT 1; END; COMMIT;",
                )
            ],
            [Migration("0001_rolls_back_in_caps", "CREATE TABLE a (id INTEGER);\n  RollBack;")],
        ]
        for migrations in refused:
            self.assertEqual(self.code_of(migrate, db, migrations), "E_MIGRATION", migrations[-1].name)
        self.assertEqual(read_user_version(db), 0)
        mentions = Migration("0001_mentions_begin", "-- BEGIN the table\nCREATE TABLE beginnings (commit_note TEXT);")
        self.assertEqual(migrate(db, [mentions]), ["0001_mentions_begin"])

    def test_a_migration_may_create_triggers_and_mention_transaction_words_inside_quotes(self) -> None:
        db = self.open()
        append_only = Migration(
            "0002_notes_are_append_only",
            "\n".join(
                [
                    "CREATE TRIGGER notes_no_update BEFORE UPDATE ON notes "
                    "BEGIN SELECT RAISE(ABORT, 'notes are append-only; COMMIT a new one'); END;",
                    "create temp trigger notes_seen AFTER INSERT ON notes\nBEGIN\n"
                    "  SELECT CASE WHEN NEW.body = '' THEN RAISE(ABORT, 'empty') END;\n  SELECT 1;\nEND;",
                    "CREATE TRIGGER notes_no_delete BEFORE DELETE ON notes "
                    "BEGIN SELECT RAISE(ABORT, 'notes are append-only'); END;",
                    "INSERT INTO notes (body) VALUES ('kept; END; of story');",
                ]
            ),
        )
        self.assertEqual(migrate(db, [CREATE, append_only]), [CREATE.name, append_only.name])
        self.assertEqual(read_user_version(db), 2)
        with self.assertRaisesRegex(DbError, "append-only"):
            db.execute("UPDATE notes SET body = 'changed'")
        with self.assertRaisesRegex(DbError, "append-only"):
            db.execute("DELETE FROM notes")
        self.assertEqual([row[0] for row in db.execute("SELECT body FROM notes")], ["kept; END; of story"])

    def test_migrations_are_loaded_from_numbered_sql_files_in_order(self) -> None:
        directory = Path(self.directory)
        (directory / "0002_add_note_index.sql").write_text(INDEX.sql, encoding="utf-8")
        (directory / "0001_create_notes.sql").write_text(CREATE.sql, encoding="utf-8")
        (directory / "README.md").write_text("not a migration", encoding="utf-8")
        self.assertEqual(load_migrations(directory), (CREATE, INDEX))


if __name__ == "__main__":
    unittest.main()
