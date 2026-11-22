from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import ambitious_kit
from ambitious_kit.build import build_zipapp
from ambitious_kit.contract import run_contract

KIT_PYTHON = Path(__file__).resolve().parents[1]
REPO = KIT_PYTHON.parents[1]
NODE_HELLO = REPO / "examples" / "hello" / "dist" / "ambitious-hello.mjs"
BROKEN = REPO / "packages" / "kit" / "test" / "fixtures" / "broken"

EXPECTED_FAILURES = {
    "faithful": [],
    "extra-envelope-field": [
        "agent-data-refusal",
        "envelope-shape",
        "exit-codes",
        "listed-shapes",
        "no-stdout-noise",
        "now-determinism",
        "read-only-analysis",
    ],
    "always-exit-zero": [
        "agent-data-refusal",
        "exit-codes",
        "listed-shapes",
        "no-stdout-noise",
        "read-only-analysis",
    ],
    "reads-the-clock": ["envelope-shape", "exit-codes", "now-determinism"],
    "allows-agent-data": ["agent-data-refusal"],
    "read-command-migrates": ["agent-data-refusal", "read-only-analysis"],
    "stdout-noise": [
        "agent-data-refusal",
        "envelope-shape",
        "exit-codes",
        "listed-shapes",
        "no-stdout-noise",
        "now-determinism",
    ],
    "refuses-help": ["envelope-shape"],
    "help-runs-the-command": ["envelope-shape"],
    "help-lists-every-command": ["envelope-shape"],
    "example-is-refused": ["listed-shapes"],
    "required-field-is-optional": ["listed-shapes"],
}


def problems_of(binary: Path, check_id: str) -> list[str]:
    return [problem for result in run_contract(str(binary)) if result.id == check_id for problem in result.problems]


def failing(binary: Path) -> list[str]:
    return sorted(result.id for result in run_contract(str(binary)) if result.problems)


class ContractTest(unittest.TestCase):
    scratch: str
    python_hello: Path

    @classmethod
    def setUpClass(cls) -> None:
        cls.scratch = tempfile.mkdtemp(prefix="ambitious-kit-python-contract-")
        cls.addClassCleanup(shutil.rmtree, cls.scratch)
        cls.python_hello = Path(cls.scratch) / "ambitious-hello.pyz"
        build_zipapp(
            cls.python_hello,
            [KIT_PYTHON / "examples" / "hello" / "hello", Path(ambitious_kit.__file__).resolve().parent],
            "hello.cli:main",
        )

    def test_the_python_hello_module_passes_every_contract_check(self) -> None:
        self.assertEqual(
            [(result.id, result.problems) for result in run_contract(str(self.python_hello)) if result.problems], []
        )

    def test_the_node_hello_module_passes_the_same_checks_run_from_python(self) -> None:
        self.assertTrue(NODE_HELLO.exists(), f"{NODE_HELLO} is missing. Run npm run build first.")
        self.assertEqual(
            [(result.id, result.problems) for result in run_contract(str(NODE_HELLO)) if result.problems], []
        )

    def test_each_broken_binary_fails_the_checks_its_one_change_breaks(self) -> None:
        os.environ["AMBITIOUS_REAL_BINARY"] = str(self.python_hello)
        self.addCleanup(os.environ.pop, "AMBITIOUS_REAL_BINARY")
        for name, expected in EXPECTED_FAILURES.items():
            with self.subTest(binary=name):
                self.assertEqual(failing(BROKEN / f"{name}.mjs"), expected)

    def test_each_shape_and_help_failure_says_what_is_wrong(self) -> None:
        os.environ["AMBITIOUS_REAL_BINARY"] = str(self.python_hello)
        self.addCleanup(os.environ.pop, "AMBITIOUS_REAL_BINARY")
        self.assertEqual(
            problems_of(BROKEN / "example-is-refused.mjs", "listed-shapes"),
            [
                '`commands`: the command "greet" lists an example that is refused with E_INPUT_SCHEMA. '
                "The example is sent as input, so it must be valid input."
            ],
        )
        self.assertEqual(
            problems_of(BROKEN / "required-field-is-optional.mjs", "listed-shapes"),
            [
                '`commands`: the command "greet" lists the field "name" as required, so the example without it '
                "must fail with E_INPUT_SCHEMA, but it answered ok."
            ],
        )
        self.assertEqual(
            problems_of(BROKEN / "refuses-help.mjs", "envelope-shape"),
            [
                "`--help --now 2026-01-01T00:00:00Z --seed 7`: must succeed, but failed with E_USAGE, E_USAGE.",
                "`selfcheck --help --now 2026-01-01T00:00:00Z --seed 7`: must succeed, but failed with E_USAGE.",
            ],
        )
        self.assertEqual(
            problems_of(BROKEN / "help-lists-every-command.mjs", "envelope-shape"),
            [
                "`selfcheck --help --now 2026-01-01T00:00:00Z --seed 7`: --help with a command name must answer "
                "with command set to that name and data.commands holding that one command's entry exactly as "
                "`commands` lists it."
            ],
        )
        self.assertRegex(
            "\n".join(problems_of(BROKEN / "help-runs-the-command.mjs", "envelope-shape")),
            r"^`selfcheck --help [^`]*`: --help must describe the command and not run it, "
            r"but AMBITIOUS_HOME now holds hello",
        )

    def test_the_python_hello_module_lists_the_shape_of_greet(self) -> None:
        listed = subprocess.run(
            [sys.executable, str(self.python_hello), "commands"],
            capture_output=True,
            text=True,
            env={**os.environ, "AMBITIOUS_HOME": str(Path(self.scratch) / "does-not-exist")},
            check=True,
        )
        greet = [entry for entry in json.loads(listed.stdout)["data"]["commands"] if entry["name"] == "greet"]
        self.assertEqual(
            greet,
            [
                {
                    "name": "greet",
                    "access": "write",
                    "input": True,
                    "fields": [{"name": "name", "type": "string", "required": True}],
                    "example": {"name": "world"},
                }
            ],
        )

    def test_the_zipapp_is_built_the_same_byte_for_byte_every_time(self) -> None:
        again = Path(self.scratch) / "again.pyz"
        build_zipapp(
            again,
            [KIT_PYTHON / "examples" / "hello" / "hello", Path(ambitious_kit.__file__).resolve().parent],
            "hello.cli:main",
        )
        self.assertEqual(again.read_bytes(), self.python_hello.read_bytes())

    def test_the_command_line_prints_one_row_per_check_and_exits_by_the_result(self) -> None:
        def contract(*args: str) -> subprocess.CompletedProcess[str]:
            return subprocess.run(
                [sys.executable, "-m", "ambitious_kit.contract", *args],
                capture_output=True,
                text=True,
                cwd=KIT_PYTHON,
                env={**os.environ, "AMBITIOUS_REAL_BINARY": str(self.python_hello)},
                check=False,
            )

        passed = contract(str(self.python_hello))
        self.assertEqual(passed.returncode, 0, passed.stdout + passed.stderr)
        self.assertRegex(passed.stdout, r"contract: ok\. 7 of 7 checks passed")
        failed = contract(str(BROKEN / "allows-agent-data.mjs"))
        self.assertEqual(failed.returncode, 1)
        self.assertIn("FAIL  agent-data-refusal", failed.stdout)
        self.assertIn("must fail with E_FORBIDDEN_PATH, but answered ok.", failed.stdout)
        self.assertEqual(contract().returncode, 2)
        missing = contract(str(Path(self.scratch) / "missing.pyz"))
        self.assertEqual(missing.returncode, 1)
        self.assertIn("does not exist. Build the module first.", missing.stdout)


if __name__ == "__main__":
    unittest.main()
