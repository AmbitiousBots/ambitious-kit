---
name: ambitious-module-installer
description: For the Ambitious Bot only. Install, repair, upgrade and selfcheck every pinned Ambitious module with one sync command, check whether the bot's instructions are the template's, upgrade a copy made from an earlier template, and decide whether a shared skill may be written. Use on the Ambitious Bot's first chat, at the start of each of its routines, when the owner updates the Ambitious Bot's template, and before the Ambitious Bot writes a skill.
---

Template version: 0.2.5

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
It also writes the template's fixture files under `template/fixtures` in `AMBITIOUS_HOME`, where other skills refer to them, and the template's instructions text to `template/instructions.md` there.

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
| `data.instructions` | Whether the bot's instructions are the template's. See "Check the instructions" below. |

Report every entry of `data.problems` to the owner as written, with what to do next, in this bot's own chat. Do not send it anywhere else. Do not start work that depends on a module whose state is `failed` or whose selfcheck is not `ok`; the other modules stay usable.
In a chat, pass on `data.notes`. In a routine, follow the routine's rule on when to speak.
Python 3.13 is needed only by the video module. When it is missing, that is a reported problem for video alone.
When `ok` is false, relay `errors[].message` and `errors[].hint`. If the command cannot start or prints no JSON, say what failed. Never invent a result or a clean selfcheck.

## Running a module

Call a module only through its link in `bin` under `AMBITIOUS_HOME`, for example `/workspace/ambitious/bin/ambitious-tasks`, with the commands its skill documents.
Pass JSON on stdin or with `--in`, never both, and keep input files outside `/home/box/agent-data`.
Read the JSON envelope: `ok`, `schemaVersion`, `module`, `command`, `data`, `errors` and `meta`. Require the expected module and command, a successful exit and `ok: true` before using a result.
On failure, explain `errors[].message`, `errors[].hint` and `data.problems[]` when present in plain words. Do not treat stderr logs as results.
Keep the returned `meta.now`, `meta.seed` and `meta.version` with the evidence, so a result can be reproduced. Let each module manage its own database.

## Check the instructions

A bot's instructions are set by its owner and never change by themselves, while these skills are replaced with every template update. The skills are written to work within the oldest instructions still supported, so nothing breaks when the instructions are older. The check below only tells the owner that a newer text exists.

In a chat, on first chat and after a template update, write your own instructions to a file and name it in the sync command. Do not do this in a routine.

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json --instructions "${AMBITIOUS_HOME:-/workspace/ambitious}/current-instructions.md"
```

Write `current-instructions.md` yourself, under `AMBITIOUS_HOME` and never under `/home/box/agent-data`: the instructions exactly as you were given them, from the first line to the last, with nothing added and nothing left out. If you cannot reproduce them exactly, run the command without `--instructions` and tell the owner the instructions were not checked.

| `data.instructions` field | Meaning |
| --- | --- |
| `state` | `current`, `out-of-date`, `custom`, `newer`, or `not checked` when no file was named. |
| `problem` | `instructions-out-of-date`: the text is one an earlier template published, or it is empty. `instructions-custom`: the text is not one any template published, so the owner or someone else wrote or changed it. Otherwise `null`. |
| `current`, `template` | The instructions version of the bot's text (`null` when it carries no `Instructions version` line and is not a published text) and of this template's text. |
| `proposed` | The file that holds this template's instructions text. |
| `diff` | The lines that differ: `- ` before a line only the bot's text has, `+ ` before a line only the template's text has. |

A problem also appears in `data.problems`, starting with its name. A customised text that already says the template's version, and a text newer than this installer knows, are entries of `data.notes` instead.

When `problem` is not `null`:

1. Write a Grok Bot Page named "Proposed instructions". It holds the two version numbers, a short diff, and then the full text of the `proposed` file, copied exactly. For the short diff use `data.instructions.diff`; when it is longer than about thirty lines, show the lines that change what the bot may do and summarise the rest by section.
2. Tell the owner in this bot's own chat, with the Page link: that the skills keep working with the instructions as they are, that the Page holds a newer text, and that pasting it into the bot's instructions is the owner's choice.
3. For `instructions-custom`, say that the present text is not the template's and that pasting the proposed text would replace whatever was written by hand. Do not call it an update. The owner decides what to take from the diff.

Never change the instructions yourself, even when a tool would let you, and never change another bot's. Do not repeat the proposal in later chats unless the owner asks or the template was updated again.

## A newer template

When `data.template.update` is `available`, a newer template release exists. The command only reports it: it never downloads, installs or runs anything from that release, because the release's own checksum list cannot vouch for itself.
Tell the owner that a newer template is available and that updating the bot's template brings it. Do not fetch the newer installer yourself, and do not change the lines below to another version or checksum.
After the template is updated, this skill carries the newer version and checksum, and the fetch lines below install it.

## Upgrade a copy made from an earlier template

A copy of the template keeps the skills, instructions and routines it was made with. This is how a bot made from template 0.2.0 to 0.2.4 gets to this version. Do the steps in this order.

1. The owner brings this skill. An earlier copy of this skill pins only its own installer, so it cannot fetch a newer one and must not try. This text, with the checksum in its fetch lines, is where trust starts, and it reaches the bot only from the owner: when the owner updates the bot's template, or hands over the template files of the new kit release (`bot.json` holds every skill body).
2. Store this skill in place of the earlier `ambitious-module-installer` skill. The owner's request to upgrade is the permission for that.
3. Run the lines under "Fetch the pinned installer" below. They download the installer this skill pins, check it against the pin, and only then switch the link `bin/ambitious-modules` to it. The earlier installer's file stays in `bin`.
4. Run the sync command with `--instructions`, as "Check the instructions" above says. `meta.version` in the result must now be this skill's template version. Modules whose pin moved are reported as `upgraded`.
5. Decide every other `ambitious-*` skill with the `skills` command under "Before writing a shared skill" below, and write the ones it answers `create` or `update` for. Template 0.2.0 named its skills without the `ambitious-` prefix: the prefixed skills are created beside those, the unprefixed ones are left alone, and you tell the owner that they are no longer used and that removing them is the owner's choice.
6. Read `data.instructions` from step 4 and follow "Check the instructions". The instructions change only if the owner pastes the proposed text.
7. Tell the owner that the routines keep the prompts they were created with, and that replacing a prompt with the one in the new template is also the owner's choice.

If the sync command answers `E_USAGE` and names `--instructions`, the installer in `bin` is from an earlier template: step 3 has not been done yet.

## Fetch the pinned installer

Run these lines when `bin/ambitious-modules` is missing, as on a new computer or after a reset, or when `meta.version` in the sync result is older than this skill's template version. Never run them to go back to an older version than the one installed.

First get the file into `bin`, by exactly one of these three ways and no other:

```sh
cd "${AMBITIOUS_HOME:-/workspace/ambitious}" && mkdir -p bin && cd bin &&
curl -fsSLO https://github.com/AmbitiousBots/ambitious-kit/releases/download/kit-v0.2.5/ambitious-modules-0.2.5.mjs
```

If that download is refused and the GitHub CLI is installed and signed in:

```sh
cd "${AMBITIOUS_HOME:-/workspace/ambitious}" && mkdir -p bin && cd bin &&
gh release download kit-v0.2.5 --repo AmbitiousBots/ambitious-kit --pattern ambitious-modules-0.2.5.mjs --clobber
```

Or from a mirror directory the owner names, set as `AMBITIOUS_MODULE_MIRROR`:

```sh
cd "${AMBITIOUS_HOME:-/workspace/ambitious}" && mkdir -p bin && cd bin &&
cp "$AMBITIOUS_MODULE_MIRROR/kit-v0.2.5/ambitious-modules-0.2.5.mjs" .
```

Then, whichever way the file arrived, check it against the pin and link it:

```sh
cd "${AMBITIOUS_HOME:-/workspace/ambitious}/bin" &&
echo "2f131dd8582c4f7e32824c45ea27bea6eb9d181dbe335c7252123e5c17af4a58  ambitious-modules-0.2.5.mjs" | sha256sum -c - &&
chmod 755 ambitious-modules-0.2.5.mjs && ln -sfn ambitious-modules-0.2.5.mjs ambitious-modules ||
{ rm -f ambitious-modules-0.2.5.mjs; false; }
```

The `sha256sum` line is the pin. If it fails, the file is deleted and the link is not made: do not run the file, and report the failure. Then run the sync command above.
A mirror directory holds each release's files in a directory named after its tag, for example `tasks-v0.1.0/ambitious-tasks-0.1.0.mjs` beside that release's `SHA256SUMS`.
To make the sync command read a mirror instead of the network, add `--from` and the directory, or set `AMBITIOUS_MODULE_MIRROR` to it. Files from a mirror pass the same checksum checks.
Never ask for, store or print an access token. If none of the three ways works, report that the installer could not be fetched and stop there.

## Before writing a shared skill

Skills live in one library shared by every bot on the account. Every `ambitious-*` skill body starts with a `Template version: x.y.z` line.
Write a shared skill only when the owner asked for it, for example by asking for a template update, or only when this bot's instructions say that shared skills may be written. Before writing one, ask the installer:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" skills --json --in skills.json
```

`skills.json` is a list with one entry per skill: `name`, `stored` (the body now in the library, or `null` when there is none) and `candidate` (the body you would write). Keep the file outside `/home/box/agent-data`.
Take `stored` from what the platform's skill tool returns, or from the skill's text as it was loaded into this conversation. Do not look for skill files in the bot's private data directory. When the exact stored body cannot be had that way, do not guess it: tell the owner which skills could not be compared, and replace those only if the owner says so.

| `data.skills[].action` | Do this |
| --- | --- |
| `create` | No such skill is stored. Write the candidate. |
| `update` | The stored skill is from an older template. Write the candidate. |
| `unchanged` | The stored text is identical. Write nothing. |
| `keep` | The stored skill is newer, or has the same version with different text. Write nothing, and follow the stored skill. |

Relay every line of `data.tellOwner`: it names the template version that owns a skill you were told to keep. Never write a skill the command did not answer `create` or `update` for.
When a stored skill is from a newer template than this one, follow the stored skill. Never change, rename or delete a skill whose name does not start with `ambitious-`.
