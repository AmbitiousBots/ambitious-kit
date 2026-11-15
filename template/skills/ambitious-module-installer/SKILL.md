---
name: ambitious-module-installer
description: For the Ambitious Bot only. Install, repair, upgrade and selfcheck every pinned Ambitious module with one sync command, and decide whether a shared skill may be written. Use on the Ambitious Bot's first chat, at the start of each of its routines, and before the Ambitious Bot writes a skill.
---

Template version: 0.2.2

# Module installer

Run one command. It does every install and check step itself; never do those steps by hand, and never edit pins.

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json
```

`/workspace/ambitious` is the default of `AMBITIOUS_HOME` on a Grok Bot computer. The command needs Node 24 and nothing else.

For every pinned module the command puts the release file into `bin` under `AMBITIOUS_HOME`, after its SHA-256 matched both the pin and the release's `SHA256SUMS`.
The pins are inside the installer, and the installer is pinned by the SHA-256 in this skill. Nothing is installed whose checksum does not come from that chain.
It changes nothing when a module is already in place, installs again a module whose file or link was removed or altered, and upgrades a module whose pin moved; the old version stays until the new one is verified.
Then it runs each module's `selfcheck --json`. It refuses `/home/box/agent-data`, the bot's private data directory, as a home, a mirror or an input.
It also writes the template's fixture files under `template/fixtures` in `AMBITIOUS_HOME`, where other skills refer to them.

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

Report every entry of `data.problems` to the owner as written, with what to do next. Do not start work that depends on a module whose state is `failed` or whose selfcheck is not `ok`; the other modules stay usable.
In a chat, pass on `data.notes`. In a routine, follow the routine's rule on when to post.
Python 3.13 is needed only by the video module. When it is missing, that is a reported problem for video alone.
When `ok` is false, relay `errors[].message` and `errors[].hint`. If the command cannot start or prints no JSON, say what failed. Never invent a result or a clean selfcheck.

## A newer template

When `data.template.update` is `available`, a newer template release exists. The command only reports it: it never downloads, installs or runs anything from that release, because the release's own checksum list cannot vouch for itself.
Tell the owner that a newer template is available and that updating the bot's template brings it. Do not fetch the newer installer yourself, and do not change the lines below to another version or checksum.
After the template is updated, this skill carries the newer version and checksum, and the fetch lines below install it.

## Fetch the pinned installer

Run these lines when `bin/ambitious-modules` is missing, as on a new computer or after a reset, or when `meta.version` in the sync result is older than this skill's template version. Never run them to go back to an older version than the one installed.

First get the file into `bin`, by exactly one of these three ways and no other:

```sh
cd "${AMBITIOUS_HOME:-/workspace/ambitious}" && mkdir -p bin && cd bin &&
curl -fsSLO https://github.com/AmbitiousBots/ambitious-kit/releases/download/kit-v0.2.2/ambitious-modules-0.2.2.mjs
```

If that download is refused and the GitHub CLI is installed and signed in:

```sh
cd "${AMBITIOUS_HOME:-/workspace/ambitious}" && mkdir -p bin && cd bin &&
gh release download kit-v0.2.2 --repo AmbitiousBots/ambitious-kit --pattern ambitious-modules-0.2.2.mjs --clobber
```

Or from a mirror directory the owner names, set as `AMBITIOUS_MODULE_MIRROR`:

```sh
cd "${AMBITIOUS_HOME:-/workspace/ambitious}" && mkdir -p bin && cd bin &&
cp "$AMBITIOUS_MODULE_MIRROR/kit-v0.2.2/ambitious-modules-0.2.2.mjs" .
```

Then, whichever way the file arrived, check it against the pin and link it:

```sh
cd "${AMBITIOUS_HOME:-/workspace/ambitious}/bin" &&
echo "523ef1047a0eba2adcfd66bb42274df79a63f1e9112d2892ec6fcbedd6bdeecb  ambitious-modules-0.2.2.mjs" | sha256sum -c - &&
chmod 755 ambitious-modules-0.2.2.mjs && ln -sfn ambitious-modules-0.2.2.mjs ambitious-modules ||
{ rm -f ambitious-modules-0.2.2.mjs; false; }
```

The `sha256sum` line is the pin. If it fails, the file is deleted and the link is not made: do not run the file, and report the failure. Then run the sync command above.
A mirror directory holds each release's files in a directory named after its tag, for example `tasks-v0.1.0/ambitious-tasks-0.1.0.mjs` beside that release's `SHA256SUMS`.
To make the sync command read a mirror instead of the network, add `--from` and the directory, or set `AMBITIOUS_MODULE_MIRROR` to it. Files from a mirror pass the same checksum checks.
Never ask for, store or print an access token. If none of the three ways works, report that the installer could not be fetched and stop there.

## Before writing a shared skill

Skills live in one library shared by every bot on the account. Every `ambitious-*` skill body starts with a `Template version: x.y.z` line. Before writing one, ask the installer:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" skills --json --in skills.json
```

`skills.json` is a list with one entry per skill: `name`, `stored` (the body now in the library, or `null` when there is none) and `candidate` (the body you would write). Keep the file outside `/home/box/agent-data`.

| `data.skills[].action` | Do this |
| --- | --- |
| `create` | No such skill is stored. Write the candidate. |
| `update` | The stored skill is from an older template. Write the candidate. |
| `unchanged` | The stored text is identical. Write nothing. |
| `keep` | The stored skill is newer, or has the same version with different text. Write nothing, and follow the stored skill. |

Relay every line of `data.tellOwner`: it names the template version that owns a skill you were told to keep. Never write a skill the command did not answer `create` or `update` for.
