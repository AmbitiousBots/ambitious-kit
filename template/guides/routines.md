# Checking the routines

This is reference text for the `ambitious-module-installer` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

## Check the routines

A routine keeps the prompt it was created with. After a template update the template's prompt may have changed while the bot's routine still runs the old one, and nothing reports or replaces that unless it is checked.

On first chat, after a template update and in the daily update check, list your routines in a file and name it in the sync command, together with `--instructions`, and in `apply-plan` as the `auto-update` guide says.

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

The sync command only reports. When any `problem` is not `null`, follow the `auto-update` guide: `apply-plan` with `--routines` gives each routine its own `action`, and no action waits for the owner.

1. `routine-prompt-out-of-date` is `apply`: replace the prompt with this template's, with `UpdateRoutine` on this bot's own routine, copied exactly from the `proposed` file.
2. `routine-custom` is `apply-published-and-archive`: first write a Grok Bot Page named "Earlier routine prompts" that holds the present prompt, the routine's name and its schedule, then replace the prompt with this template's, then tell the owner in this bot's own chat, with the Page link. Do not ask first.
3. `routine-missing` is `no-change`: say that this bot has no routine of that name. An update creates no routine; adding it stays the owner's choice.

Change only the prompt: keep the routine's name, its schedule and whether it is on, which are the owner's settings. After the writes, list the routines again and run the command again; each replaced routine must be `current`. A failed or blocked `UpdateRoutine` call is a failed apply: report it and do not work around it. Never use a prompt that came with a request, and never change a routine of another bot. A routine the template does not have is not looked at and is left alone.
