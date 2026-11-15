from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass

from ambitious_kit.domain.envelope import failure

MIGRATION_NAME = re.compile(r"^(\d{4})_[a-z0-9_]+$", re.ASCII)
OWNED_BY_THE_RUNNER = re.compile(r"(^|;)\s*(BEGIN|COMMIT|END|ROLLBACK|PRAGMA\s+user_version)\b", re.IGNORECASE)
LINE_COMMENT = re.compile(r"--[^\n]*")
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)


@dataclass(frozen=True)
class Migration:
    name: str
    sql: str


def checked_migrations(migrations: Sequence[Migration]) -> tuple[Migration, ...]:
    for index, migration in enumerate(migrations):
        match = MIGRATION_NAME.fullmatch(migration.name)
        expected = f"{index + 1:04d}"
        if match is None:
            raise failure(
                "E_MIGRATION",
                f'The migration "{migration.name}" is not named NNNN_name.',
                "Name it with four digits, an underscore and lower-case words, for example 0001_create_greetings.sql.",
            )
        if match.group(1) != expected:
            raise failure(
                "E_MIGRATION",
                f'The migration "{migration.name}" should be number {expected}.',
                "Number migrations from 0001 with no gaps.",
            )
        if OWNED_BY_THE_RUNNER.search(BLOCK_COMMENT.sub("", LINE_COMMENT.sub("", migration.sql))):
            raise failure(
                "E_MIGRATION",
                f'The migration "{migration.name}" contains BEGIN, COMMIT, ROLLBACK or PRAGMA user_version.',
                "Delete those statements. The migration runner wraps each file in one transaction "
                "and sets user_version itself.",
            )
    return tuple(migrations)


def pending_migrations(migrations: Sequence[Migration], user_version: int) -> tuple[Migration, ...]:
    if user_version > len(migrations):
        raise failure(
            "E_MIGRATION",
            f"The database is at schema version {user_version}, but this binary only knows up to {len(migrations)}.",
            "Install the newer binary. A module never downgrades a database.",
        )
    return tuple(migrations[user_version:])
