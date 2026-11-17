from __future__ import annotations

import json
import unittest
from pathlib import Path

from ambitious_kit.domain.json_schema import describe_schema_problems, schema_problems

ROOT = Path(__file__).resolve().parents[3]
SCHEMAS = ROOT / "schemas" / "interchange"
EXAMPLES = ROOT / "examples" / "interchange"


def read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def json_files(directory: Path) -> list[Path]:
    return sorted(path for path in directory.iterdir() if path.name.endswith(".json"))


class InterchangeSchemas(unittest.TestCase):
    def test_every_schema_has_examples(self) -> None:
        names = [path.name.removesuffix(".json") for path in json_files(SCHEMAS)]
        self.assertEqual(sorted(path.name for path in EXAMPLES.iterdir()), names)
        self.assertEqual(len(names), 5)

    def test_valid_examples_are_accepted(self) -> None:
        for schema_file in json_files(SCHEMAS):
            schema = read_json(schema_file)
            for example in json_files(EXAMPLES / schema_file.name.removesuffix(".json") / "valid"):
                with self.subTest(example=str(example.relative_to(ROOT))):
                    self.assertEqual(describe_schema_problems(schema_problems(schema, read_json(example))), "")

    def test_invalid_examples_are_refused_for_the_expected_reason(self) -> None:
        for schema_file in json_files(SCHEMAS):
            schema = read_json(schema_file)
            folder = EXAMPLES / schema_file.name.removesuffix(".json")
            expected = read_json(folder / "expected-failures.json")
            assert isinstance(expected, dict)
            invalid = json_files(folder / "invalid")
            self.assertEqual(sorted(expected), [path.name for path in invalid])
            for example in invalid:
                with self.subTest(example=str(example.relative_to(ROOT))):
                    problems = schema_problems(schema, read_json(example))
                    wanted = expected[example.name]
                    self.assertTrue(
                        any(
                            found.pointer == wanted["pointer"] and found.keyword == wanted["keyword"]
                            for found in problems
                        ),
                        describe_schema_problems(problems),
                    )

    def test_unknown_keyword_is_an_error(self) -> None:
        with self.assertRaises(ValueError):
            schema_problems({"oneOf": []}, 1)
        with self.assertRaises(ValueError):
            schema_problems({"$ref": "https://example.com/schema"}, 1)

    def test_true_is_not_an_integer(self) -> None:
        self.assertEqual(len(schema_problems({"type": "integer"}, True)), 1)
        self.assertEqual(schema_problems({"type": "integer"}, 3), [])
        self.assertEqual(len(schema_problems({"const": 1}, True)), 1)


if __name__ == "__main__":
    unittest.main()
