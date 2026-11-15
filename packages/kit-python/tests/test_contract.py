from __future__ import annotations

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
        "no-stdout-noise",
        "now-determinism",
        "read-only-analysis",
    ],
    "always-exit-zero": ["agent-data-refusal", "exit-codes", "no-stdout-noise", "read-only-analysis"],
    "reads-the-clock": ["envelope-shape", "exit-codes", "now-determinism"],
    "allows-agent-data": ["agent-data-refusal"],
    "read-command-migrates": ["agent-data-refusal", "read-only-analysis"],
    "stdout-noise": ["agent-data-refusal", "envelope-shape", "exit-codes", "no-stdout-noise", "now-determinism"],
}


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
        self.assertRegex(passed.stdout, r"contract: ok\. 6 of 6 checks passed")
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
