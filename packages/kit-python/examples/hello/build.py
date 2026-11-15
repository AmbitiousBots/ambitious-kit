from __future__ import annotations

import sys
from pathlib import Path

import ambitious_kit
from ambitious_kit.build import build_zipapp

HERE = Path(__file__).resolve().parent


def main() -> None:
    target = HERE / "dist" / "ambitious-hello.pyz"
    build_zipapp(target, [HERE / "hello", Path(ambitious_kit.__file__).resolve().parent], "hello.cli:main")
    sys.stdout.write(f"{target}\n")


if __name__ == "__main__":
    main()
