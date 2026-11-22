from __future__ import annotations

import json
import unittest
from pathlib import Path
from types import SimpleNamespace

from ambitious_kit.domain.actor import ACTOR_RULE, actor_problem, parse_actor
from ambitious_kit.domain.envelope import ErrorEntry, Failure
from ambitious_kit.domain.input_shape import FIELD_TYPES, InputField, InputShape, listed_shape, shape_problems

FIXTURES = Path(__file__).resolve().parents[2] / "kit" / "test" / "fixtures"


def cases(name: str) -> list[dict[str, object]]:
    loaded: list[dict[str, object]] = json.loads((FIXTURES / name).read_text(encoding="utf-8"))
    return loaded


def shape_of(raw: object) -> object:
    if not isinstance(raw, dict):
        return raw
    fields = raw.get("fields")
    if isinstance(fields, list):
        fields = [SimpleNamespace(**field) if isinstance(field, dict) else field for field in fields]
    return SimpleNamespace(fields=fields, example=raw.get("example"))


def actor_of(case: dict[str, object]) -> object:
    repeat, times = case.get("repeat"), case.get("times")
    return repeat * times if isinstance(repeat, str) and isinstance(times, int) else case.get("actor")


class InputShapeTest(unittest.TestCase):
    def test_every_shape_case_shared_with_the_typescript_kit_gives_the_same_problems(self) -> None:
        shared = cases("input-shape-cases.json")
        self.assertGreaterEqual(len(shared), 16)
        for case in shared:
            with self.subTest(case=case["title"]):
                self.assertEqual(
                    shape_problems("add", case["takesInput"] is True, shape_of(case["shape"])), case["problems"]
                )

    def test_a_field_type_that_is_a_list_is_a_reported_problem_and_not_a_type_error(self) -> None:
        unhashable = SimpleNamespace(
            fields=[SimpleNamespace(name="title", type=["string"], required=True)], example=None
        )
        self.assertEqual(
            shape_problems("add", True, unhashable),
            [
                'command "add": field "title" has a type that is not a string; '
                "use one of: string, number, integer, boolean, object, array"
            ],
        )

    def test_the_allowed_field_types_are_the_six_json_kinds(self) -> None:
        self.assertEqual(FIELD_TYPES, ("string", "number", "integer", "boolean", "object", "array"))

    def test_a_shape_is_listed_as_its_fields_and_when_given_its_example(self) -> None:
        fields = [InputField("title", "string", True), InputField("actor", "string", False)]
        listed = [
            {"name": "title", "type": "string", "required": True},
            {"name": "actor", "type": "string", "required": False},
        ]
        self.assertEqual(listed_shape(InputShape(fields)), {"fields": listed})
        self.assertEqual(
            listed_shape(InputShape(fields, {"title": "Ship the release"})),
            {"fields": listed, "example": {"title": "Ship the release"}},
        )


class ActorTest(unittest.TestCase):
    def test_every_actor_case_shared_with_the_typescript_kit_gives_the_same_answer(self) -> None:
        shared = cases("actor-cases.json")
        self.assertGreaterEqual(len(shared), 30)
        for case in shared:
            actor, problem = actor_of(case), case["problem"]
            with self.subTest(case=case["title"]):
                self.assertEqual(actor_problem(actor), problem)
                if problem is None:
                    self.assertEqual(parse_actor(actor), actor)
                    continue
                with self.assertRaises(Failure) as raised:
                    parse_actor(actor)
                self.assertEqual(
                    list(raised.exception.errors),
                    [
                        ErrorEntry(
                            "E_INPUT_SCHEMA",
                            f'The input field "actor" {problem}.',
                            f"Send an actor that fits this rule: {ACTOR_RULE}",
                        )
                    ],
                )

    def test_lone_surrogates_are_refused_and_paired_astral_characters_count_as_one(self) -> None:
        refused = "has a control character, a line break or half of a surrogate pair"
        self.assertEqual(actor_problem("a\ud800b"), refused)
        self.assertEqual(actor_problem("\udc00"), refused)
        self.assertIsNone(actor_problem("\U0001f600" * 200))
        self.assertEqual(actor_problem("\U0001f600" * 201), "has 201 characters")

    def test_the_actor_rule_in_the_hint_states_the_whole_rule(self) -> None:
        self.assertEqual(
            ACTOR_RULE,
            "actor is 1 to 200 Unicode characters, with no control characters or line breaks and no leading or "
            "trailing whitespace. Internal spaces are allowed. Nothing is trimmed.",
        )


if __name__ == "__main__":
    unittest.main()
