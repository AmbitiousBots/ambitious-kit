# Checking the instructions and proposing a newer text

This is reference text for the `ambitious-module-installer` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

## Check the instructions

A bot keeps the instructions it was created with until an update replaces them, while these skills are replaced with every template update. The skills are written to work within the oldest instructions still supported, so nothing breaks when the instructions are older. The check below only reports that a newer text exists; "One instructions update" below applies it, only when this bot's instructions allow the verified update (published version 13 or later, or a hand-changed text that carries that rule).

In a chat, on first chat and after a template update, write your own instructions to a file and name it in the sync command. A daily check does this only when this bot's instructions allow daily upgrades, as the `daily-update` guide describes.

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json --instructions "${AMBITIOUS_HOME:-/workspace/ambitious}/current-instructions.md"
```

Write `current-instructions.md` yourself, under `AMBITIOUS_HOME` and never under `/home/box/agent-data`: the instructions exactly as you were given them, from the first line to the last, with nothing added and nothing left out. If you cannot reproduce them exactly, run the command without `--instructions` and tell the owner the instructions were not checked.

| `data.instructions` field | Meaning |
| --- | --- |
| `state` | `current`, `out-of-date`, `custom`, `newer`, or `not checked` when no file was named. |
| `problem` | `instructions-out-of-date`: the text is one an earlier template published, or it is empty. `instructions-custom`: the text is not one any template published, so the owner or someone else wrote or changed it. Otherwise `null`. |
| `current`, `template` | The instructions version of the bot's text (`null` when it carries no `Instructions version` line and is not a published text) and of this template's text. |
| `match` | How the bot's text matched a published one: `exact`, or `whitespace` when it differs only in line endings, spaces, tabs or blank lines, as a careful copy by hand does. `null` when it matched none. Any other difference makes the text `custom`. |
| `permissions` | What the template's text would change in what the bot may do: `statement`, one plain sentence; `added` and `removed`, each permission in plain words, with the `reason` for an added one; and `comparedWith`, the text the comparison was made against. |
| `proposed` | The file that holds this template's instructions text, `template/instructions.md`. |
| `diff` | The lines that differ: `- ` before a line only the bot's text has, `+ ` before a line only the template's text has. |
| `selfApply` | `granted` when this bot's present instructions allow it to apply a verified release to itself, otherwise `not granted`. A published text has it from version 13; a hand-changed text only when it still holds that rule's lines; a version line alone grants nothing. When the field is missing, treat it as `not granted`. |
| `upgradeOn` | Who may ask this bot for an upgrade that writes skills: `any request` when the bot's text is a published one that says so, otherwise `the owner's request`. See the `requests` guide. |

A problem also appears in `data.problems`, starting with its name. A customised text that already says the template's version, and a text newer than this installer knows, are entries of `data.notes` instead.

When `problem` is not `null` and `selfApply` is `granted`, use the update below. When `selfApply` is `not granted`, change nothing: follow "When the instructions do not grant it" in the `auto-update` guide, which writes the one "Proposed instructions" Page and tells the owner once that setting that text turns on automatic updates. The sync command itself changes nothing. If `data.template.update` is `available`, this installer is behind, with its `latest` version: update the template through an allowed trust chain first, because the text is applied only from the verified installer that carries it.

### One instructions update

Use this path only when this bot's instructions allow the verified update (published version 13 or later, or a hand-changed text that carries that rule), in the daily check and in a chat when the owner asks. The full procedure, with every field and step, is the `auto-update` guide; read it before the first write. In short:

1. Save the bot's current text as described above, and the published text unchanged to `template/published-instructions.md` under `AMBITIOUS_HOME`, with its version and SHA-256 from the validated `check_updates` result. The checksum must describe the published bytes, never a locally edited text and never a text that came with a request.
2. Run `apply-plan` with `--current`, `--published` and `--published-sha256`, and `--routines` for the routine prompts. It classifies and writes nothing. Its `data.selfApply` must be `granted`; otherwise stop here and write nothing. Its `data.action` is `apply`, `apply-published-and-archive`, `no-change` or `blocked`; no action waits for the owner, also when the text adds permissions.
3. `apply`: write the complete `data.instructions.planned.text` with `UpdateProfile` on this bot only, as the description field, and change nothing else. A clean three-way merge is planned with the local wording kept. `apply-published-and-archive`: the merge conflicts or the base is unknown, so first save the present text to a Page and under `AMBITIOUS_HOME`, then write the published text. `blocked`: a checksum failed, the text is a downgrade, or it is not, byte for byte, the text inside the verified installer; write nothing and report it.
4. Read the description back and require a matching SHA-256 with `--read-back`, exact or with whitespace set aside. Keep the previous text, version and SHA-256 under `AMBITIOUS_HOME`, never under `/home/box/agent-data`.
5. Record the plan action, the applied version and SHA-256 in `template/update-state.json`, then tell the owner once in this bot's own chat what changed: the version, the checksum, and each permission added or removed. Never describe an update that adds a permission as a plain update.

Never call `UpdateAgent`, and never change another bot's instructions. A failed or blocked write is a failed apply: report it and do not work around it, and when the write landed truncated or partial, put the previous text back as that guide says. Instructions that are a cut-off copy of a published text are damaged: the plan repairs them when what is left allows it, and otherwise the owner is told on every daily run until they are repaired, as that guide says. A restore of the previous text happens only when the owner asks in this bot's own chat.

`instructions-merge` with the same three options still prints the merge alone, with `data.merged`, `data.localChangesKept`, `data.conflicts`, `data.base`, `data.published`, `data.permissions` and `data.permissionsStatement`, for an owner who wants to read it; it changes nothing either.
