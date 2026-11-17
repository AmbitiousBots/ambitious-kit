# The capability probe

This is reference text for the `ambitious-capability-probe` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

Run before the first audit and each snapshot, and repeat after an account, role, connector, or computer change.
Use available read-only Grok Bot tools. Never read Grok internals or inspect private backing files to learn about the account, and never ask a module to discover account access.
The probe needs no file from `/home/box/agent-data`, the bot's private data directory: do not read there for it, and put nothing from there into the probe's result or any module input.
Do not request broader permissions, edit another bot, or send data while probing.

## Establish the scope

Record the account role, the current bot, the requested audit scope, and the observation time.
Use `owner`, `guest`, or `team` for `account.kind` only when an account tool reports that role or the account holder has stated it.
Otherwise record `unknown` and describe that gap. Never infer a role from what the bot can or cannot see, and do not put the audit off: for an unknown role the audit module answers with `mode` `partial`, holds back the recommendations that depend on the role and marks their findings `withheld`.
Ownership, a team membership, an installed connector, and a tool's presence do not prove readable data.

| Account kind | What to verify |
| --- | --- |
| owner | Test the owner's actual accessible scope. Do not presume account-wide transcripts, usage, or audit history. |
| guest | Test only the shared scope. An invitation does not prove access to the owner's other bots or account totals. |
| team | Test the current team's shared scope and the current user's permissions. Do not infer access to private bots or other teams. |
| unknown | Test what the tools actually return, row by row. Assume nothing that a role would imply. |

## Inventory the observations

For each row below, record the read-only tool used, the scope it returned, any pagination or time limit, and a plain explanation of missing access.
Follow all available pages before describing a list as complete. A failed call, an unavailable tool, or an incomplete response is a gap.
Do not use a successful read of one resource as proof of access to other resources.

| Capability | Evidence to inspect |
| --- | --- |
| Own bots | The returned bot inventory and ownership information, including whether it covers the requested scope. |
| Other bots | A returned inventory beyond the current bot, with its sharing and account limits. |
| Transcripts | Readable transcript content for the requested bots and period, not just chat titles or the current conversation. |
| Usage by bot | Reported usage for the requested bots and period, with attribution and any missing bots stated. A report that lists only the bots that used the most and sums the rest in one line leaves each bot inside that line unseen. |
| Usage by routine | Reported usage attributed to routines for the same scope and period. Bot totals alone do not establish this. |
| Pages | Readable Page inventory and content, with any sharing or pagination limits. |
| Memory | Memory exposed through supported tools, with the scope and limits of what was actually returned. |
| Connectors | Returned connector inventory, with each connector's name, tool names and status. The tool names come from the platform's tool catalog, read per connector namespace; a count of tools is not a list of names. Configuration alone does not prove that connector content is readable. |
| Audit log | Readable account event history for the requested scope and period, not an ordinary chat transcript. |

Keep this inventory locally under `AMBITIOUS_HOME`, never under `/home/box/agent-data`. The probe writes no Page. During a snapshot, include the retained inventory in the review Page only after `review-page` says it is due. Pass observed source values to the collector without estimating missing counts or calculating totals. A value no tool returned is passed as `null`, never as zero.
Record usage in the unit the platform reports, credits, percentages or shares of all bot usage in a period, and do not convert one into another. The `ambitious-audit-collector` skill says how to ask for a usage report by bot and how to write it down.
Keep tool identifiers and short evidence references so the collector can trace claims. Do not copy full transcripts, secrets, or private backing data into evidence.

## The monitoring connection in the probe

Find the monitoring connection as the `connection` guide says, then:

Record it in the local inventory as present and signed in, present and needing a sign-in, or absent, and whether its identity was confirmed or not confirmed.
When a connector is `unidentified`, its tools were not read. Record what the first line of `data.tellOwner` says: whether there is a monitoring connection among the connectors whose tools were read, how many were read, and which were not. Do not go by the name.
The probe only reads these names; it does not call `send_report` or `send_feedback`.

## Write the audit visibility array

Return a JSON array. The collector places it unchanged in its `visibility` field.
Each entry has exactly `signal`, `seen`, and `why`. `seen` is a JSON boolean; `why` is a nonempty plain sentence naming the observed scope or the missing access.
The installed audit module names the signals it expects: run `ambitious-audit schema` and include each signal of its collector schema exactly once. The pinned audit module expects these nine, and refuses an array that leaves one out or adds another.

| Signal | Set `seen` to true only when |
| --- | --- |
| `transcripts` | Transcript content was actually observed across the requested scope and period. |
| `usage` | Usage was observed for the requested period for every listed bot and every listed routine, in credits, percentages or shares. A bot that is only inside a summed line such as "Other bots" was not observed. |
| `otherBots` | A completed bot inventory beyond the current bot was returned for the requested scope. An authoritative empty inventory can establish visibility; a missing response cannot. |
| `auditLog` | Audit event history was actually observed across the requested scope and period. |
| `accountRole` | An account tool reported the role, or the account holder stated it. |
| `tasks` | The open, stale and blocked task counts were read from the output of `ambitious-tasks counts`, and its `exists` was `true`. A list that does not exist was not seen. |
| `pages` | The Page count and the count of Pages updated in the last 7 days were both returned. |
| `botActivity` | A last-active time, or that the bot has never been active, was shown for every listed bot. |
| `routines` | A routine count was shown for every listed bot, and a last run, or that it has never run, for every listed routine. |

Use `false` for partial coverage, denied access, unavailable tools, errors, and untested access.
When some information is visible but coverage is incomplete, describe both the visible part and the gap in `why`.
Do not encode unknown as zero, omit a signal, or infer visibility from the role.
The last five signals each cover a group of collector values. When any value of the group is `null`, or the role is `unknown`, that signal's `seen` must be false; the module refuses a document where it is not.
A capability with no signal in the schema stays a gap in the local inventory; do not invent wire signals or relabel it as `auditLog`.
Carry every gap into the next due audit Page and report review. Do not claim the report covers information the collector cannot represent.

## Fixture scenarios

The fixtures are expected entries for the nine signals above, for synthetic tool observations. They do not establish real account permissions or replace live probing.
The `ambitious-module-installer` sync command writes them to `template/fixtures/ambitious-capability-probe` under `AMBITIOUS_HOME`, by default `/workspace/ambitious/template/fixtures/ambitious-capability-probe`. Read them there.

In the owner scenario (`owner.expected.json`), the account tool identifies an owner. A complete bot inventory, requested transcripts, and bot usage are returned. Routine usage and audit history are unavailable. Task counts, Page counts, bot activity and routines are all read. Memory and connector status are readable within the requested scope and belong in the separate local inventory for the next due Page.

In the guest scenario (`guest.expected.json`), the account tool identifies a guest. Only the current shared bot and its shared Page are readable. The tools deny transcripts, usage, other bot inventory, the Page list and the routine list; no audit log tool is available, the `ambitious-tasks` module is not installed, and the shared bot's last-active time is not shown. Memory and connector status are unavailable and belong in the separate local inventory for the next due Page.

In the unknown-role scenario (`role-unknown.expected.json`), no tool reports the role and the account holder has not stated it. A complete bot inventory is returned, though without a last-active time for one bot. Usage by bot is shown as percentage shares, and usage by routine, transcripts, audit history and the Page list are unavailable. Task counts and routines are read. The role is recorded as `unknown` and the audit still runs.

For a team account, repeat the same evidence tests against its actual shared scope. Do not substitute any fixture as an account default.
Return the collector's `visibility` array: exactly `signal`, `seen` and `why` for each signal in `ambitious-audit schema`.
