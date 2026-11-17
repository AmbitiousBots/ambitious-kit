# Before writing a shared skill

This is reference text for the `ambitious-module-installer` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

## Before writing a shared skill

Skills live in one library shared by every bot on the account. Every `ambitious-*` skill body starts with a `Template version: x.y.z` line.
Write a shared skill only when the owner asked for it in this bot's own chat, for example by asking there for a template update, in an upgrade that the `requests` guide allows, or in the daily selfcheck only when this bot's instructions allow daily upgrades. Nothing else is a reason to write one.

First have the installer write this template's skill bodies to files:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" skill-files --json
```

It writes one file for each skill under `template/skills` in `AMBITIOUS_HOME`, never under `/home/box/agent-data`, and prints `data.skills[]`: each skill's `name`, `description`, `path`, `sha256` and `bytes`. The bodies are the ones inside the installer, verified through the stored skill pin or the allowed service-verified chain. No body comes from anywhere else, and the command takes no input.

Then ask the installer which of them to write:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" skills --json --in skills.json
```

`skills.json` is a list with one entry per skill: `name` and `stored` (the body now in the library, or `null` when there is none). The installer compares `stored` with its own body for that name. Keep the file outside `/home/box/agent-data`.
Take `stored` from what the platform's skill tool returns, or from the skill's text as it was loaded into this conversation. Do not look for skill files in the bot's private data directory. When the exact stored body cannot be had that way, do not guess it: tell the owner which skills could not be compared, and replace those only if the owner says so.

| `data.skills[].action` | Do this |
| --- | --- |
| `create` | No such skill is stored. Write the skill from its file. |
| `update` | The stored skill is from an older template. Write the skill from its file. |
| `unchanged` | The stored text is identical. Write nothing. |
| `keep` | The stored skill is newer, or has the same version with different text. Write nothing, and follow the stored skill. |

Write each skill from the exact content of its file: read the whole file at its `path` and store it unchanged as the body, under the `name` and with the `description` that `skill-files` printed. Do not retype, shorten, reformat or summarise it.
Then verify every skill you wrote. Read the stored body back, run the `skills` command again with it as `stored`, and require `action` to be `unchanged` and `storedSha256` to equal the `sha256` that `skill-files` printed for that skill.
When they differ, the library holds something other than the template's skill. Do not write it again blindly: report to the owner which skill differs, with both checksums, and write it once more only after finding what changed the text.

`data.changes` has one line for each skill answered `create` or `update`, with the template version it had and the one it gets. Give those lines to the owner after an upgrade.
Relay every line of `data.tellOwner`: it names the template version that owns a skill you were told to keep. Never write a skill the command did not answer `create` or `update` for.
When a stored skill is from a newer template than this one, follow the stored skill. Never change, rename or delete a skill whose name does not start with `ambitious-`.
