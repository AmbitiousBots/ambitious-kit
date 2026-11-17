from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

from ambitious_kit.cli.runner import Io, ModuleSpec, cli_envelope
from ambitious_kit.domain.envelope import Failure
from ambitious_kit.runtime import RUNTIME_MARKER, activate, lock_sha256, pinned_runtime

LOCK = "solver==1.2.3 --hash=sha256:" + "a" * 64 + "\n"
SHA = lock_sha256(LOCK)


def build(home: Path, *, marker: object | None, python: str | None) -> Path:
    path = home / "constraints" / "runtime" / SHA
    path.mkdir(parents=True)
    if marker is not None:
        (path / RUNTIME_MARKER).write_text(json.dumps(marker), encoding="utf-8")
    if python is not None:
        (path / "lib" / python / "site-packages").mkdir(parents=True)
    return path


class PinnedRuntimeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.home = Path(os.path.realpath(self.directory.name))
        self.env = {"AMBITIOUS_HOME": str(self.home)}

    def test_missing_runtime_is_reported_with_how_to_install_it(self) -> None:
        runtime = pinned_runtime(self.env, "constraints", LOCK)
        self.assertEqual(runtime.state, "missing")
        self.assertEqual(runtime.path, str(self.home / "constraints" / "runtime" / SHA))
        self.assertIn("--runtime", runtime.problem or "")
        with self.assertRaises(Failure) as raised:
            activate(runtime)
        self.assertEqual([error.code for error in raised.exception.errors], ["E_RUNTIME"])
        self.assertEqual(raised.exception.data["pinnedRuntime"], runtime.to_json())

    def test_directory_without_a_marker_is_damaged(self) -> None:
        build(self.home, marker=None, python="python3.13")
        self.assertEqual(pinned_runtime(self.env, "constraints", LOCK, (3, 13)).state, "damaged")

    def test_marker_of_another_lock_is_damaged(self) -> None:
        build(self.home, marker={"lockSha256": "b" * 64}, python="python3.13")
        self.assertEqual(pinned_runtime(self.env, "constraints", LOCK, (3, 13)).state, "damaged")

    def test_runtime_built_for_another_python_is_damaged(self) -> None:
        build(self.home, marker={"lockSha256": SHA}, python="python3.12")
        runtime = pinned_runtime(self.env, "constraints", LOCK, (3, 13))
        self.assertEqual(runtime.state, "damaged")
        self.assertIn("Python 3.13", runtime.problem or "")

    def test_ready_runtime_is_put_on_the_import_path_once(self) -> None:
        path = build(self.home, marker={"lockSha256": SHA}, python="python3.13")
        runtime = pinned_runtime(self.env, "constraints", LOCK, (3, 13))
        self.assertEqual(runtime.state, "ready")
        self.assertIsNone(runtime.problem)
        before = list(sys.path)
        self.addCleanup(lambda: sys.path.__setitem__(slice(None), before))
        activate(runtime)
        activate(runtime)
        self.assertEqual(sys.path.count(str(path / "lib" / "python3.13" / "site-packages")), 1)

    def test_private_data_directory_is_refused(self) -> None:
        with self.assertRaises(Failure) as raised:
            pinned_runtime({"AMBITIOUS_HOME": "/home/box/agent-data/home"}, "constraints", LOCK)
        self.assertEqual([error.code for error in raised.exception.errors], ["E_FORBIDDEN_PATH"])


class SelfcheckReportsTheRuntime(unittest.TestCase):
    def envelope(self, home: Path, runtime_lock: str | None) -> dict[str, object]:
        binary = home / "binary.pyz"
        binary.write_bytes(b"binary")
        spec = ModuleSpec("constraints", "0.1.0", 1, (), {}, runtime_lock)
        io = Io(
            argv=["selfcheck", "--now", "2026-01-01T00:00:00Z", "--seed", "7"],
            env={"AMBITIOUS_HOME": str(home)},
            binary_path=str(binary),
            read_stdin=lambda: "",
            system_now=lambda: datetime(2026, 1, 1, tzinfo=UTC),
            system_seed=lambda: 0,
            write_stderr=lambda _text: None,
        )
        parsed: dict[str, object] = json.loads(cli_envelope(spec, io).serialize())
        return parsed

    def test_module_without_a_lock_reports_nothing_new(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            data = self.envelope(Path(os.path.realpath(directory)), None)["data"]
            assert isinstance(data, dict)
            self.assertEqual(sorted(data), ["binary", "db", "problems", "runtime"])

    def test_missing_runtime_is_a_warning_and_selfcheck_stays_ok(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            result = self.envelope(Path(os.path.realpath(directory)), LOCK)
            data = result["data"]
            assert isinstance(data, dict)
            self.assertTrue(result["ok"])
            self.assertEqual(data["problems"], [])
            self.assertEqual(data["pinnedRuntime"]["state"], "missing")
            self.assertEqual(data["pinnedRuntime"]["lockSha256"], SHA)
            self.assertEqual(len(data["warnings"]), 1)

    def test_ready_runtime_has_no_warning(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            home = Path(os.path.realpath(directory))
            build(home, marker={"lockSha256": SHA}, python=f"python{sys.version_info.major}.{sys.version_info.minor}")
            data = self.envelope(home, LOCK)["data"]
            assert isinstance(data, dict)
            self.assertEqual(data["pinnedRuntime"]["state"], "ready")
            self.assertEqual(data["warnings"], [])


if __name__ == "__main__":
    unittest.main()
