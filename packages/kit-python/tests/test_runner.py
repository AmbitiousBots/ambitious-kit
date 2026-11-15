from __future__ import annotations

import json
import os
import tempfile
import unittest
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from ambitious_kit.cli.command import Context, DbContext, no_input, pure_command, read_command, write_command
from ambitious_kit.cli.runner import Io, ModuleSpec, cli_envelope
from ambitious_kit.domain.clock import format_instant
from ambitious_kit.domain.envelope import Envelope, JsonObject, envelope_problems, failure
from ambitious_kit.domain.migrations import Migration

NOW = "2026-01-01T00:00:00Z"


@dataclass(frozen=True)
class Note:
    body: str


def parse_note(raw: object) -> Note:
    body = raw.get("body") if isinstance(raw, dict) else None
    if not isinstance(body, str):
        raise failure("E_INPUT_SCHEMA", 'The input field "body" must be a string.', 'Send { "body": "..." }.')
    return Note(body)


def add(context: DbContext[Note]) -> JsonObject:
    context.db.execute("INSERT INTO notes (body, at) VALUES (?, ?)", (context.input.body, format_instant(context.now)))
    if context.input.body == "refuse me":
        raise failure("E_REFUSED", "This note is refused.", "Send another body.", {"body": context.input.body})
    if context.input.body == "crash":
        raise TypeError("a bug in the module")
    return {"added": context.input.body}


def count(context: DbContext[None]) -> JsonObject:
    return {"count": context.db.execute("SELECT count(*) FROM notes").fetchone()[0]}


def count_sneaky(context: DbContext[None]) -> JsonObject:
    context.db.execute("DELETE FROM notes")
    return {}


def dice_roll(context: Context[None]) -> JsonObject:
    return {"roll": context.rng.randint(1, 6), "at": format_instant(context.now)}


SPEC = ModuleSpec(
    module="notes",
    version="0.1.0",
    schema_version=1,
    migrations=[
        Migration(
            "0001_create_notes", "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL, at TEXT NOT NULL);"
        )
    ],
    commands={
        "add": write_command(add, parse_note),
        "count": read_command(count, no_input),
        "count sneaky": read_command(count_sneaky, no_input),
        "dice roll": pure_command(dice_roll, no_input),
    },
)


@dataclass(frozen=True)
class Run:
    envelope: Envelope
    stderr: str

    @property
    def codes(self) -> list[str]:
        return [error.code for error in self.envelope.errors]


class RunnerTest(unittest.TestCase):
    def setUp(self) -> None:
        scratch = tempfile.TemporaryDirectory(prefix="ambitious-kit-python-cli-")
        self.addCleanup(scratch.cleanup)
        self.home = scratch.name

    def run_cli(self, argv: Sequence[str], stdin: str = "", env: Mapping[str, str] | None = None) -> Run:
        stderr: list[str] = []
        io = Io(
            argv=argv,
            env={"AMBITIOUS_HOME": self.home, **(env or {})},
            binary_path=__file__,
            read_stdin=lambda: stdin,
            system_now=lambda: datetime(2030, 6, 1, 12, tzinfo=UTC),
            system_seed=lambda: 123,
            write_stderr=stderr.append,
        )
        envelope = cli_envelope(SPEC, io)
        self.assertEqual(envelope_problems(json.loads(envelope.serialize())), [])
        return Run(envelope, "".join(stderr))

    def test_a_write_command_stores_its_change_and_a_read_command_sees_it(self) -> None:
        added = self.run_cli(["add", "--now", NOW, "--seed", "7"], '{"body":"first"}')
        self.assertEqual(added.envelope.data, {"added": "first"})
        self.assertEqual(
            (added.envelope.identity.meta.now, added.envelope.identity.meta.seed), ("2026-01-01T00:00:00.000Z", 7)
        )
        self.assertEqual(self.run_cli(["count"]).envelope.data, {"count": 1})

    def test_without_now_and_seed_the_shell_clock_and_seed_are_used_and_echoed(self) -> None:
        rolled = self.run_cli(["dice", "roll"])
        self.assertEqual(rolled.envelope.identity.command, "dice roll")
        self.assertEqual(
            (rolled.envelope.identity.meta.now, rolled.envelope.identity.meta.seed), ("2030-06-01T12:00:00.000Z", 123)
        )
        again = self.run_cli(["dice", "roll", "--now=2030-06-01T12:00:00Z", "--seed=123", "--json"])
        self.assertEqual(again.envelope.serialize(), rolled.envelope.serialize())

    def test_a_write_command_that_fails_leaves_no_trace_in_the_database(self) -> None:
        self.run_cli(["add"], '{"body":"kept"}')
        refused = self.run_cli(["add"], '{"body":"refuse me"}')
        self.assertEqual(
            (refused.codes, refused.envelope.data, refused.envelope.exit_code),
            (["E_REFUSED"], {"body": "refuse me"}, 1),
        )
        crashed = self.run_cli(["add"], '{"body":"crash"}')
        self.assertEqual((crashed.codes, crashed.envelope.exit_code), (["E_INTERNAL"], 2))
        self.assertIn("TypeError: a bug in the module", crashed.stderr)
        self.assertNotIn("a bug in the module", crashed.envelope.serialize())
        self.assertEqual(self.run_cli(["count"]).envelope.data, {"count": 1})

    def test_a_read_command_cannot_write_and_fails_until_the_database_exists(self) -> None:
        self.assertEqual(self.run_cli(["count"]).codes, ["E_MIGRATION"])
        self.assertFalse(os.path.exists(os.path.join(self.home, "notes")))
        self.run_cli(["add"], '{"body":"kept"}')
        sneaky = self.run_cli(["count", "sneaky"])
        self.assertEqual(sneaky.codes, ["E_DB"])
        self.assertIn("readonly", sneaky.stderr)
        self.assertEqual(self.run_cli(["count"]).envelope.data, {"count": 1})

    def test_input_problems_and_usage_problems_each_carry_the_command_they_know(self) -> None:
        file = os.path.join(self.home, "note.json")
        Path(file).write_text('{"body":"from a file"}', encoding="utf-8")
        self.assertEqual(self.run_cli(["add", "--in", file]).envelope.data, {"added": "from a file"})
        cases: list[tuple[list[str], str, str, str]] = [
            (["add"], "", "E_INPUT_SCHEMA", "add"),
            (["add"], "not json", "E_INPUT_SCHEMA", "add"),
            (["add"], '{"body":7}', "E_INPUT_SCHEMA", "add"),
            (["add", "--in", os.path.join(file, "missing.json")], "", "E_INPUT_SCHEMA", "add"),
            (["add", "--in", file], '{"body":"both"}', "E_USAGE", "add"),
            (["count", "--in", file], "", "E_USAGE", "count"),
            ([], "", "E_USAGE", ""),
            (["cuont"], "", "E_USAGE", ""),
            (["dice"], "", "E_USAGE", ""),
            (["count", "--verbose"], "", "E_USAGE", "count"),
            (["count", "--now", "noon"], "", "E_USAGE", "count"),
            (["count", "--seed", "4294967296"], "", "E_USAGE", "count"),
            (["count", "--seed"], "", "E_USAGE", "count"),
        ]
        for argv, stdin, code, command in cases:
            result = self.run_cli(argv, stdin)
            self.assertEqual((result.codes, result.envelope.identity.command), ([code], command), " ".join(argv))
            self.assertEqual(result.envelope.exit_code, 1)
        self.assertEqual(
            self.run_cli(["cuont"]).envelope.errors[0].hint,
            "Use one of: add, commands, count, count sneaky, dice roll, selfcheck.",
        )

    def test_every_given_path_is_checked_against_the_private_data_directory(self) -> None:
        forbidden = "/home/box/agent-data"
        attempts: list[tuple[list[str], dict[str, str]]] = [
            (["count", "--db", f"{forbidden}/notes.sqlite"], {}),
            (["add", "--in", f"{forbidden}/note.json"], {}),
            (["selfcheck"], {"AMBITIOUS_HOME": forbidden}),
            (["dice", "roll"], {"AMBITIOUS_HOME": f"{forbidden}/home"}),
        ]
        for argv, env in attempts:
            self.assertEqual(self.run_cli(argv, env=env).codes, ["E_FORBIDDEN_PATH"], " ".join(argv))

    def test_selfcheck_creates_and_migrates_the_database_then_changes_nothing(self) -> None:
        first = self.run_cli(["selfcheck", "--now", NOW, "--seed", "7"])
        self.assertTrue(first.envelope.ok)
        self.assertEqual(
            first.envelope.data["db"],
            {
                "path": os.path.join(self.home, "notes", "notes.sqlite"),
                "integrityCheck": "ok",
                "userVersion": 1,
                "migrationsApplied": ["0001_create_notes"],
            },
        )
        self.assertEqual(first.envelope.data["problems"], [])
        second = self.run_cli(["selfcheck", "--now", NOW, "--seed", "7"])
        self.assertEqual(json.loads(second.envelope.serialize())["data"]["db"]["migrationsApplied"], [])

    def test_selfcheck_on_a_damaged_database_lists_the_problem_and_exits_2(self) -> None:
        garbage = os.path.join(self.home, "garbage.sqlite")
        Path(garbage).write_text("this file is not a database\n" * 64, encoding="utf-8")
        result = self.run_cli(["selfcheck", "--db", garbage])
        self.assertEqual((result.codes, result.envelope.exit_code), (["E_DB"], 2))
        data = json.loads(result.envelope.serialize())["data"]
        self.assertEqual(len(data["problems"]), 1)
        self.assertEqual(len(data["binary"]["sha256"]), 64)

    def test_the_commands_command_lists_every_command_with_how_it_touches_the_database(self) -> None:
        self.assertEqual(
            self.run_cli(["commands"]).envelope.data,
            {
                "commands": [
                    {"name": "add", "access": "write", "input": True},
                    {"name": "commands", "access": "none", "input": False},
                    {"name": "count", "access": "read", "input": False},
                    {"name": "count sneaky", "access": "read", "input": False},
                    {"name": "dice roll", "access": "none", "input": False},
                    {"name": "selfcheck", "access": "write", "input": False},
                ]
            },
        )

    def test_a_module_spec_that_breaks_the_naming_rules_is_refused(self) -> None:
        io = Io([], {}, __file__, lambda: "", lambda: datetime(2030, 1, 1, tzinfo=UTC), lambda: 0, lambda _text: None)
        with self.assertRaisesRegex(ValueError, "lower-case name"):
            cli_envelope(ModuleSpec("Notes", "0.1.0", 1, [], {}), io)
        with self.assertRaisesRegex(ValueError, "provided by the kit"):
            cli_envelope(ModuleSpec("notes", "0.1.0", 1, [], {"selfcheck": pure_command(dice_roll, no_input)}), io)


if __name__ == "__main__":
    unittest.main()
