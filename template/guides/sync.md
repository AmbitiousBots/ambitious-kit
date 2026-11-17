# The sync result, running a module and a mirror

This is reference text for the `ambitious-module-installer` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

## What the sync command does

`/workspace/ambitious` is the default of `AMBITIOUS_HOME` on a Grok Bot computer. The sync command needs Node 24 and nothing else.

For every pinned module the sync command puts the release file into `bin` under `AMBITIOUS_HOME`, after its SHA-256 matched both the pin and the release's `SHA256SUMS`.
The pins are inside the installer. Its trust starts at the SHA-256 in the stored skill, or, only when this bot's instructions allow service-verified downloads, at both the authenticated service checksum and the release checksum list described in the `daily-update` guide. Nothing is installed whose checksum does not come from one of those chains.
It changes nothing when a module is already in place, installs again a module whose file or link was removed or altered, and upgrades a module whose pin moved; the old version stays until the new one is verified.
Then it runs each module's `selfcheck --json`. It refuses `/home/box/agent-data`, the bot's private data directory, as a home, a mirror or an input.
It also writes the template's fixture files under `template/fixtures` in `AMBITIOUS_HOME`, where other skills refer to them, the template's instructions text to `template/instructions.md` there, and each template routine's prompt to `template/routines` there.

## Read the result

The command prints one JSON envelope. Read it; do not rely on the exit code alone.

| Field | Meaning |
| --- | --- |
| `data.summary` | One sentence to relay to the owner. |
| `data.modules[].state` | `installed`, `unchanged`, `reinstalled`, `upgraded` or `failed`. |
| `data.modules[].selfcheck` | `ok`, `problems` or `not run`. |
| `data.problems` | Every problem in plain words, each starting with the module it concerns. Empty means every module is installed and its selfcheck is ok. |
| `data.notes` | Things worth knowing that are not problems, such as a newer template being available. |
| `data.template` | This installer's template version, where the fixtures are, and `update`: `current`, `available` with the `latest` version, or `not checked` with `why`. |
| `data.instructions` | Whether the bot's instructions are the template's. See the `instructions` guide. |
| `data.routines` | Whether the bot's routine prompts are the template's. See the `routines` guide. |

Report every entry of `data.problems` to the owner as written, with what to do next, in this bot's own chat. Do not send it anywhere else. Do not start work that depends on a module whose state is `failed` or whose selfcheck is not `ok`; the other modules stay usable.
In a chat, pass on `data.notes`. In a routine, follow the routine's rule on when to speak.
A problem that starts with `instructions-` or `routine-` is about this bot's own text, not about a module: every module stays usable.
Python 3.13 is needed only by the video module. When it is missing, that is a reported problem for video alone.
When `ok` is false, relay `errors[].message` and `errors[].hint`. If the command cannot start or prints no JSON, say what failed. Never invent a result or a clean selfcheck.

## Running a module

Call a module only through its link in `bin` under `AMBITIOUS_HOME`, for example `/workspace/ambitious/bin/ambitious-tasks`, with the commands its skill documents.
Pass JSON on stdin or with `--in`, never both, and keep input files outside `/home/box/agent-data`.
Read the JSON envelope: `ok`, `schemaVersion`, `module`, `command`, `data`, `errors` and `meta`. Require the expected module and command, a successful exit and `ok: true` before using a result.
On failure, explain `errors[].message`, `errors[].hint` and `data.problems[]` when present in plain words. Do not treat stderr logs as results.
Keep the returned `meta.now`, `meta.seed` and `meta.version` with the evidence, so a result can be reproduced. Let each module manage its own database.

## A mirror

A mirror directory holds each release's files in a directory named after its tag, for example `tasks-v0.1.0/ambitious-tasks-0.1.0.mjs` beside that release's `SHA256SUMS`.
To make the sync command read a mirror instead of the network, add `--from` and the directory, or set `AMBITIOUS_MODULE_MIRROR` to it. Files from a mirror pass the same checksum checks.
