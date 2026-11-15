from __future__ import annotations

from dataclasses import dataclass
from importlib.resources import files

from ambitious_kit.cli.command import DbContext, no_input, read_command, write_command
from ambitious_kit.cli.runner import ModuleSpec, run_cli
from ambitious_kit.db.sqlite import load_migrations
from ambitious_kit.domain.clock import format_instant
from ambitious_kit.domain.envelope import JsonObject, failure

OPENINGS = ("Hello", "Good day", "Welcome")
MAX_NAME_LENGTH = 100


@dataclass(frozen=True)
class GreetingRequest:
    name: str


def parse_greeting_request(raw: object) -> GreetingRequest:
    name = raw.get("name") if isinstance(raw, dict) else None
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= MAX_NAME_LENGTH:
        raise failure(
            "E_INPUT_SCHEMA",
            f'The input field "name" must be a string of 1 to {MAX_NAME_LENGTH} characters.',
            'Send input like { "name": "world" }.',
        )
    return GreetingRequest(name.strip())


def _greeting(row: tuple[int, str, str, str]) -> JsonObject:
    return {"id": row[0], "name": row[1], "text": row[2], "createdAt": row[3]}


def greet(context: DbContext[GreetingRequest]) -> JsonObject:
    name = context.input.name
    text = f"{context.rng.choice(OPENINGS)}, {name}."
    created_at = format_instant(context.now)
    cursor = context.db.execute(
        "INSERT INTO greetings (name, text, created_at) VALUES (?, ?, ?)", (name, text, created_at)
    )
    return {"greeting": _greeting((cursor.lastrowid or 0, name, text, created_at))}


def list_greetings(context: DbContext[None]) -> JsonObject:
    rows: list[tuple[int, str, str, str]] = context.db.execute(
        "SELECT id, name, text, created_at FROM greetings ORDER BY id"
    ).fetchall()
    return {"greetings": [_greeting(row) for row in rows]}


def main() -> int:
    return run_cli(
        ModuleSpec(
            module="hello",
            version="0.1.0",
            schema_version=1,
            migrations=load_migrations(files("hello") / "migrations"),
            commands={
                "greet": write_command(greet, parse_greeting_request),
                "list": read_command(list_greetings, no_input),
            },
        )
    )
