---
name: ambitious-module-installer
description: For the Ambitious Bot only. Install, repair, upgrade and selfcheck every pinned Ambitious module with one sync command. Use on the Ambitious Bot's first chat and at the start of each of its routines.
---

# Module installer

Run one command. It does every install and check step itself; never do those steps by hand, and never edit pins.

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json
```

`/workspace/ambitious` is the default of `AMBITIOUS_HOME` on a Grok Bot computer. The command needs Node 24 and nothing else.

For every pinned module the command puts the release file into `bin` under `AMBITIOUS_HOME`, after its SHA-256 matched both the pin and the release's `SHA256SUMS`.
It changes nothing when a module is already in place, installs again a module whose file or link was removed or altered, and upgrades a module whose pin moved; the old version stays until the new one is verified.
Then it runs each module's `selfcheck --json`. It refuses `/home/box/agent-data`, the bot's private data directory.
It first looks for a newer template release and, when there is one, uses that release's installer and pins.

## Read the result

The command prints one JSON envelope. Read it; do not rely on the exit code alone.

| Field | Meaning |
| --- | --- |
| `data.summary` | One sentence to relay to the owner. |
| `data.modules[].state` | `installed`, `unchanged`, `reinstalled`, `upgraded` or `failed`. |
| `data.modules[].selfcheck` | `ok`, `problems` or `not run`. |
| `data.problems` | Every problem in plain words, each starting with the module it concerns. Empty means every module is installed and its selfcheck is ok. |
| `data.template` | The template release whose pins were used, and whether a newer one was found. |

Report every entry of `data.problems` to the owner as written, with what to do next. Do not start work that depends on a module whose state is `failed` or whose selfcheck is not `ok`; the other modules stay usable.
Python 3.13 is needed only by the video module. When it is missing, that is a reported problem for video alone.
When `ok` is false, relay `errors[].message` and `errors[].hint`. If the command cannot start or prints no JSON, say what failed. Never invent a result or a clean selfcheck.

## When the command is not there yet

On a new computer, or after the computer was reset, `bin/ambitious-modules` is missing. Fetch it once, then run the sync command above:

```sh
home="${AMBITIOUS_HOME:-/workspace/ambitious}"
mkdir -p "$home/bin" && cd "$home/bin" &&
curl -fsSLO https://github.com/AmbitiousBots/ambitious-kit/releases/download/kit-v0.2.1/ambitious-modules-0.2.1.mjs &&
echo "71917eb5158925cda67855342f94891e1f7b22de26fdf218cbeca70891a67aff  ambitious-modules-0.2.1.mjs" | sha256sum -c - &&
chmod 755 ambitious-modules-0.2.1.mjs && ln -sfn ambitious-modules-0.2.1.mjs ambitious-modules
```

The `sha256sum` line is the pin. If it fails, delete the downloaded file, do not run it, and report the failure.
If the download is refused, get the same file another way and then run the same lines from `echo` on:

- With a signed-in GitHub CLI: `gh release download kit-v0.2.1 --repo AmbitiousBots/ambitious-kit --pattern ambitious-modules-0.2.1.mjs`.
- From a mirror directory the owner names: copy `kit-v0.2.1/ambitious-modules-0.2.1.mjs` out of it.

A mirror directory holds each release's files in a directory named after its tag, for example `tasks-v0.1.0/ambitious-tasks-0.1.0.mjs` beside that release's `SHA256SUMS`.
To make the sync command read a mirror instead of the network, add `--from` and the directory, or set `AMBITIOUS_MODULE_MIRROR` to it. Files from a mirror pass the same checksum checks.
Never ask for, store or print an access token. If no source works, report that the modules could not be fetched and stop there.
