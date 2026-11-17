# Checking the instructions and proposing a newer text

This is reference text for the `ambitious-module-installer` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

## Check the instructions

A bot's instructions are set by its owner and never change by themselves, while these skills are replaced with every template update. The skills are written to work within the oldest instructions still supported, so nothing breaks when the instructions are older. The check below only tells the owner that a newer text exists.

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
| `permissions` | What pasting the template's text would change in what the bot may do: `statement`, one plain sentence to give the owner word for word; `added` and `removed`, each permission in plain words, with the `reason` for an added one; and `comparedWith`, the text the comparison was made against. |
| `proposed` | The file that holds this template's instructions text. |
| `diff` | The lines that differ: `- ` before a line only the bot's text has, `+ ` before a line only the template's text has. |
| `upgradeOn` | Who may ask this bot for an upgrade that writes skills: `any request` when the bot's text is a published one that says so, otherwise `the owner's request`. See the `requests` guide. |

A problem also appears in `data.problems`, starting with its name. A customised text that already says the template's version, and a text newer than this installer knows, are entries of `data.notes` instead.

When `problem` is not `null`, use the merge proposal below. Do not replace the owner's local changes with the published text. If `data.template.update` is `available`, say that this installer is behind, with its `latest` version, and that a newer template may carry a different, possibly narrower text; update the template through an allowed trust chain before proposing its instructions.

### One instructions proposal

Use this same path in a chat and in an allowed daily check. Save the bot's current text as described above. Save the published text unchanged to `template/published-instructions.md` under `AMBITIOUS_HOME`; take its version and SHA-256 from the authenticated update result, or copy the trusted installer's sync-written `template/instructions.md` and compute its SHA-256 when the instructions do not allow that call. The checksum must describe the published bytes, never a locally edited text. Set `published_sha256` to that checksum, then run:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" instructions-merge --current "${AMBITIOUS_HOME:-/workspace/ambitious}/current-instructions.md" --published "${AMBITIOUS_HOME:-/workspace/ambitious}/template/published-instructions.md" --published-sha256 "$published_sha256" --json
```

The result has `data.merged`, `data.localChangesKept`, `data.conflicts`, `data.base`, `data.published`, `data.permissions` and `data.permissionsStatement`; copy the latter word for word, including its uncertainty warning. The merge uses the embedded published version the bot's text came from as its base, keeps local changes, and shows both versions of a conflict. An unknown base shows both complete texts; never silently drop one. A checksum mismatch stops the proposal.

1. Read `template/update-state.json` under `AMBITIOUS_HOME`. If its proposed published version is the same or newer, do not ask again, even if the checksum changed, unless the owner asks. A changed checksum for the same published version is a problem to report, never a new release to trust.
2. Write or update ONE Grok Bot Page named "Proposed instructions". Include the current and published versions, the merged text, the local changes kept, every conflict with both versions shown, and the merge's permissions statement word for word. Show added permissions with their reasons and removed permissions. For a custom or conflicted text, keep the check's warning that its permissions cannot be determined from a version line; do not claim the merge has been approved or is ready to paste while conflicts remain.
3. After the Page succeeds, record the proposed published version, SHA-256 and Page identifier in `template/update-state.json` under `AMBITIOUS_HOME`, never under `/home/box/agent-data`, immediately before the routine's final reply. In chat, record it after the message succeeds. Reuse that Page for a newer proposal. Do not ask again until a newer published instructions version arrives or the owner asks.
4. Tell the owner once in this bot's own chat, with the Page link: the skills keep working with the instructions as they are, what pasting changes in what the bot may do, and that pasting it into the bot's instructions is the owner's choice. Never describe a text that adds a permission as a plain update.

Never change the instructions yourself, even when a tool would let you, and never change another bot's. The owner resolves conflicts and pastes the chosen text.
