---
name: ambitious-capability-probe
description: For the Ambitious Bot only. Inspect observed account access and produce an honest visibility array for an audit. Use before the Ambitious Bot collects an audit or a snapshot, and after an account, role, connector or computer change.
---

Template version: 0.2.2

# Capability probe

Run before the first audit and each snapshot, and repeat after an account, role, connector, or computer change.
Use available read-only Grok Bot tools. Never read Grok internals or inspect private backing files to learn about the account, and never ask a module to discover account access.
Nothing read from `/home/box/agent-data`, the bot's private data directory, may go into the probe's result or any module input. The only files you may read there are the platform's own skill and Page-kit reference files that the platform documents at that location.
Do not request broader permissions, edit another bot, or send data while probing.

## Establish the scope

Record the account role, the current bot, the requested audit scope, and the observation time.
Use `owner`, `guest`, or `team` for `account.kind` only when an account tool reports that role.
If no tool reports the role, record `unknown` and describe that gap. Do not invent a role and do not put the audit off: the audit module runs in a partial mode for an unknown role, and withholds or marks what depends on it.
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
| Usage by bot | Reported usage for the requested bots and period, with attribution and any missing bots stated. |
| Usage by routine | Reported usage attributed to routines for the same scope and period. Bot totals alone do not establish this. |
| Pages | Readable Page inventory and content, with any sharing or pagination limits. |
| Memory | Memory exposed through supported tools, with the scope and limits of what was actually returned. |
| Connectors | Returned connector inventory and status. Configuration alone does not prove that connector content is readable. |
| Audit log | Readable account event history for the requested scope and period, not an ordinary chat transcript. |

Keep this inventory in the audit's Grok Bot Page. Pass observed source values to the collector without estimating missing counts or calculating totals. A value no tool returned is passed as `null`, never as zero.
Record usage in the unit the platform reports, credits or percentage shares, and do not convert one into the other.
Keep tool identifiers and short evidence references so the collector can trace claims. Do not copy full transcripts, secrets, or private backing data into evidence.

## Write the audit visibility array

Return a JSON array. The collector places it unchanged in its `visibility` field.
Each entry has exactly `signal`, `seen`, and `why`. `seen` is a JSON boolean; `why` is a nonempty plain sentence naming the observed scope or the missing access.
The installed audit module names the signals it expects: run `ambitious-audit schema` and include each signal of its collector schema exactly once. Every version expects these four, in this order.

| Signal | Set `seen` to true only when |
| --- | --- |
| `transcripts` | Transcript content was actually observed across the requested scope and period. |
| `usage` | Both usage by bot and usage by routine were observed across the requested scope and period. |
| `otherBots` | A completed bot inventory beyond the current bot was returned for the requested scope. An authoritative empty inventory can establish visibility; a missing response cannot. |
| `auditLog` | Audit event history was actually observed across the requested scope and period. |

Use `false` for partial coverage, denied access, unavailable tools, errors, and untested access.
When some information is visible but coverage is incomplete, describe both the visible part and the gap in `why`.
Do not encode unknown as zero, omit a signal, or infer visibility from the role.
For any further signal the schema lists, such as one for the account role, apply the same test: `seen` is true only when a tool returned that information for the requested scope.
A capability with no signal in the schema stays a gap in the Page inventory; do not invent wire signals or relabel it as `auditLog`.
Carry every gap into the audit Page and report review. Do not claim the report covers information the collector cannot represent.

## Fixture scenarios

The fixtures are expected entries for the four signals above, for synthetic tool observations. They do not establish real account permissions or replace live probing.
The `ambitious-module-installer` sync command writes them to `template/fixtures/ambitious-capability-probe` under `AMBITIOUS_HOME`, by default `/workspace/ambitious/template/fixtures/ambitious-capability-probe`. Read them there.

In the owner scenario (`owner.expected.json`), the account tool identifies an owner. A complete bot inventory, requested transcripts, and bot usage are returned. Routine usage and audit history are unavailable. Pages, memory, and connector status are readable within the requested scope and belong in the separate Page inventory.

In the guest scenario (`guest.expected.json`), the account tool identifies a guest. Only the current shared bot and its shared Page are readable. The tools deny transcripts, usage, and other bot inventory; no audit log tool is available. Memory and connector status are unavailable and belong in the separate Page inventory.

In the unknown-role scenario (`role-unknown.expected.json`), no tool reports the role. A complete bot inventory is returned, usage by bot is shown as percentage shares, and usage by routine, transcripts and audit history are unavailable. The role is recorded as `unknown` and the audit still runs.

For a team account, repeat the same evidence tests against its actual shared scope. Do not substitute any fixture as an account default.
