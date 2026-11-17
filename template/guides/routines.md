# Checking the routines

This is reference text for the `ambitious-module-installer` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

## Check the routines

A routine keeps the prompt it was created with. After a template update the template's prompt may have changed while the bot's routine still runs the old one, and nothing reports that unless it is checked.

In a chat, on first chat and after a template update, list your routines in a file and name it in the sync command, together with `--instructions`. Do not do this in a routine.

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" sync --json --instructions "${AMBITIOUS_HOME:-/workspace/ambitious}/current-instructions.md" --routines "${AMBITIOUS_HOME:-/workspace/ambitious}/current-routines.json"
```

Write `current-routines.json` yourself, under `AMBITIOUS_HOME` and never under `/home/box/agent-data`: a JSON list with one `{ "name", "schedule", "prompt" }` entry for each routine this bot has now, taken from the platform's routine tool, with each prompt copied exactly. If the routine tool does not return the prompts, run the command without `--routines` and tell the owner the routines were not checked.

`data.routines.state` is `checked`, or `not checked` when no file was named. `data.routines.routines` has one entry for each routine of the template:

| Field | Meaning |
| --- | --- |
| `state` | `current`, `out-of-date`, `missing` or `custom`. |
| `problem` | `routine-prompt-out-of-date`: the routine runs a prompt an earlier template published; `publishedIn` names that template. `routine-missing`: this bot has no routine of that name. `routine-custom`: the prompt is not one any template published, so the owner or someone else wrote or changed it. Otherwise `null`. |
| `match` | `exact` or `whitespace`, as for the instructions, or `variant`. Prompts are compared with line endings, spaces, tabs and blank lines set aside. `variant` means a published prompt with a `Destination:` line added at its end, as some copies of the template stored it; it counts as that published prompt, current or out of date. |
| `schedule` | `current`, the schedule this bot's routine has, and `template`, the template's default. A different time is the owner's setting and is not a problem. |
| `starts` | `active` or `paused`: how the template creates the routine. |
| `prompt`, `proposed` | This template's prompt, and the file under `template/routines` that holds the same text. |

Each problem also appears in `data.problems`, starting with its name.

When any `problem` is not `null`:

1. Write a Grok Bot Page named "Proposed routines". For each routine with a problem it holds the routine's name, the problem in plain words, the template's schedule and whether it starts paused, and the full text of the template's prompt, copied exactly from the `proposed` file.
2. Tell the owner in this bot's own chat, with the Page link, which routines differ and that replacing a prompt, or adding a missing routine, happens only when the owner asks for it.
3. For `routine-custom`, say that the present prompt is not the template's and that replacing it would lose whatever was written by hand.

Nothing changes automatically. Never replace a routine's prompt, change its schedule, create a missing routine or turn one on because of this check: do it only after the owner asks, in this bot's own chat. A routine the template does not have is not looked at and is left alone.
