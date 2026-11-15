from __future__ import annotations

import json
import unittest
from pathlib import Path

from ambitious_kit.domain.args import parse_args
from ambitious_kit.domain.clock import format_instant, parse_now, parse_seed
from ambitious_kit.domain.envelope import ErrorEntry, Identity, Meta, envelope_problems, err, ok

EXAMPLES = Path(__file__).resolve().parents[3] / "examples" / "envelopes"
IDENTITY = Identity(1, "tasks", "next", Meta("2026-01-01T00:00:00.000Z", 7, "0.1.0"))
CYCLE = ErrorEntry("E_CYCLE", "T-12 depends on itself.", "Choose another task.")
DB = ErrorEntry("E_DB", "The database could not be read.", "Run selfcheck.")


class EnvelopeTest(unittest.TestCase):
    def test_every_valid_example_envelope_in_the_contract_is_accepted(self) -> None:
        for file in sorted((EXAMPLES / "valid").iterdir()):
            self.assertEqual(envelope_problems(json.loads(file.read_text(encoding="utf-8"))), [], file.name)

    def test_every_invalid_example_envelope_in_the_contract_is_refused_with_a_reason(self) -> None:
        invalid = sorted((EXAMPLES / "invalid").iterdir())
        self.assertGreaterEqual(len(invalid), 8)
        for file in invalid:
            self.assertNotEqual(envelope_problems(json.loads(file.read_text(encoding="utf-8"))), [], file.name)

    def test_an_ok_envelope_is_one_line_with_the_seven_fields_in_contract_order(self) -> None:
        result = ok(IDENTITY, {"task": "T-12", "note": "café"})
        self.assertEqual(
            result.serialize(),
            '{"ok":true,"schemaVersion":1,"module":"tasks","command":"next","data":{"task":"T-12","note":"café"},'
            '"errors":[],"meta":{"now":"2026-01-01T00:00:00.000Z","seed":7,"version":"0.1.0"}}\n',
        )
        self.assertEqual(envelope_problems(json.loads(result.serialize())), [])
        self.assertEqual(result.exit_code, 0)

    def test_a_caller_error_exits_1_and_an_internal_error_exits_2_also_when_mixed(self) -> None:
        self.assertEqual(err(IDENTITY, [CYCLE]).exit_code, 1)
        self.assertEqual(err(IDENTITY, [DB]).exit_code, 2)
        self.assertEqual(err(IDENTITY, [CYCLE, DB]).exit_code, 2)
        self.assertEqual(envelope_problems(json.loads(err(IDENTITY, [CYCLE], {"cycle": ["T-12"]}).serialize())), [])
        with self.assertRaises(ValueError):
            err(IDENTITY, [])


class FlagTest(unittest.TestCase):
    def test_now_is_read_as_an_instant_and_needs_a_time_zone(self) -> None:
        accepted = [
            ("2026-01-01T00:00:00Z", "2026-01-01T00:00:00.000Z"),
            ("2026-03-05T09:30:00+01:00", "2026-03-05T08:30:00.000Z"),
            ("2026-03-05T09:30-05:30", "2026-03-05T15:00:00.000Z"),
            ("2026-12-31T23:59:59.5Z", "2026-12-31T23:59:59.500Z"),
            ("2024-02-29T12:00:00.123Z", "2024-02-29T12:00:00.123Z"),
            ("0099-01-01T00:00:00Z", "0099-01-01T00:00:00.000Z"),
        ]
        for text, instant in accepted:
            parsed = parse_now(text)
            self.assertIsNotNone(parsed, text)
            if parsed is not None:
                self.assertEqual(format_instant(parsed), instant, text)
        refused = [
            "2026-01-01T00:00:00",
            "2026-01-01",
            "yesterday",
            "",
            "2026-02-30T00:00:00Z",
            "2025-02-29T00:00:00Z",
            "2026-01-01T24:00:00Z",
            "2026-01-01T00:60:00Z",
            "2026-01-01T00:00:00+24:00",
            "2026-01-01T00:00:00.1234Z",
            "2026-01-01 00:00:00Z",
            "0000-01-01T00:00:00Z",
            "9999-12-31T23:59:59-01:00",
        ]
        for text in refused:
            self.assertIsNone(parse_now(text), text)

    def test_seed_is_a_whole_number_from_0_to_4294967295(self) -> None:
        self.assertEqual([parse_seed("0"), parse_seed("7"), parse_seed("4294967295")], [0, 7, 4294967295])
        for text in ["4294967296", "-1", "1.5", "", "seven", "+7", "1e3", "99999999999", "٧"]:
            self.assertIsNone(parse_seed(text), text)

    def test_flags_take_a_value_inline_or_as_the_next_word_and_unknown_ones_are_problems(self) -> None:
        parsed = parse_args(["dep", "--now=2026-01-01T00:00:00Z", "add", "--seed", "7", "--json", "--db", "x.sqlite"])
        self.assertEqual(
            (parsed.words, parsed.now, parsed.seed, parsed.db, parsed.input_file, parsed.problems),
            (("dep", "add"), "2026-01-01T00:00:00Z", "7", "x.sqlite", None, ()),
        )
        self.assertEqual(parse_args(["next", "--verbose"]).problems, ('Unknown flag "--verbose".',))
        self.assertEqual(parse_args(["next", "--seed"]).problems, ("The flag --seed needs a value.",))
        self.assertEqual(parse_args(["next", "--seed", "--json"]).problems, ("The flag --seed needs a value.",))
        self.assertEqual(
            parse_args(["next", "--seed", "1", "--seed=2"]).problems, ("The flag --seed was given more than once.",)
        )


if __name__ == "__main__":
    unittest.main()
