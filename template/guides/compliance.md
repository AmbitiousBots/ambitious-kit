# Track controls and evidence on the Ambitious service

This is reference text for the `ambitious-compliance-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

The register lives in the owner's organization on the Ambitious service and is read and changed with the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`. It is built from the same parts as everything else kept there: typed records (the `records` guide), kept documents and facts (the `contracts` guide), and commitments (the `tasks` guide).
Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 14`. Under an earlier text call none of them and tell the owner that the instructions update turns this on; the `auto-update` guide says how that update is applied.
Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema.
The register records what the owner tells it. It does not judge whether the business meets any law, standard or certification, and neither do you: report what is on record, never a compliance opinion.

## How the register is laid out

| Part | Kept as | Tool |
| --- | --- | --- |
| A program: a set of requirements the owner tracks | A kept document of `kind` `program`, whose text lists each control with its reference, title, owner, how often proof is needed and the first day | `ingest_document` |
| The dates and intervals of a program | Facts about that document, such as `ac_1.start` | `propose_facts` |
| A control | A record of the type `compliance-control` | `define_record_type` once, then `create_record` |
| A control's regular proof | A commitment whose `subjectId` is the program document | `propose_commitment` |
| Evidence, an attestation or a policy | A kept document of `kind` `evidence`, `attestation` or `policy`, with its Page reference in `sourceRef` | `ingest_document` |
| Proof was collected for a control | The due occurrence reported done, with the evidence document | `whats_due`, `complete_obligation` |

Agree the record type with the owner, then define it once. This definition is the one this guide's status rule reads:

```json
{"type":"compliance-control","version":1,"fields":{"ref":{"kind":"string","required":true,"unique":true},"title":{"kind":"string","required":true},"program_document":{"kind":"string","required":true},"owner":{"kind":"string"},"commitment":{"kind":"string"}},"stages":["proposed","active","retired"],"initial":"proposed","transitions":[{"from":"proposed","to":"active","requires":["commitment"]},{"from":"active","to":"retired"}],"terminal":["retired"]}
```

`ref` is the control's short reference, at most 32 characters; `title` is at most 120. `program_document` and `commitment` hold the ids the tools returned.

## Add a program and its controls

1. Write the program as plain text, agree it with the owner, and keep it with `ingest_document`.
2. For each control, propose the facts its rule needs with `propose_facts`: the first day as `"YYYY-MM-DD"`, and a number of days where the rule uses one. Use the control's reference in lower case with underscores as the first part of the key.
3. Create the control with `create_record`, in the stage `proposed`.
4. Propose its regular proof with `propose_commitment`: `title` is the reference and the title, `obligor` is the control's owner, `obligee` is the owner's organization, and the `rule` is `recurring` with `every` set to `month`, `quarter` or `year`. Leave `acceptance` as `person`, so a member accepts each proof.
5. Put the returned commitment id in the record with `update_record`, and move it to `active` with `move_record`.
6. Tell the owner what waits on the service's `/records` page: the proposed facts to confirm and the proposed commitments to activate. A signed-in member of the owner's organization does both; no tool does. Until then nothing is scheduled and the control's status is `unknown`.

## Record proof

When proof is collected, write or update its document as a Grok Bot Page, keep its text with `ingest_document` and the Page reference in `sourceRef`, find the control's due occurrence with `whats_due` or `get_commitment`, and report it with `complete_obligation`: the `occurrenceId`, the `rev` you read, and `evidence` naming the kept document. A member accepts it on `/records` before it counts. An attestation is the same: keep the person's statement, with who made it and when, as a document of `kind` `attestation`.
`ingest_document` answers with the `sha256` of the text it kept: record it in the Page. To check later that a document is unchanged, compare the SHA-256 of its present text, as UTF-8, with that value. Show the owner a difference before keeping the changed text as a new version with `documentId` set.

## Where a control stands

Read the controls with `query_records` for the type `compliance-control` and the stage `active`. For each, call `get_commitment` with its `commitment` and read the commitment's status, `missingFacts` and occurrences. Take the first row that fits, top to bottom, and nothing else:

| Status | When |
| --- | --- |
| `unknown` | The call failed, the record has no `commitment`, the commitment is not active, or `missingFacts` is not empty |
| `red` | An occurrence is `overdue` |
| `yellow` | An occurrence is `open` or `submitted`: proof is due, or reported and not yet accepted |
| `green` | An occurrence is `satisfied` |
| `unknown` | Anything else: no proof has been due yet |

Ignore occurrences that are `waived` or `superseded`, except to say that they exist. Each reason is one plain sentence that names the period and the state as returned, for example that the proof for a period is overdue, with no evidence content. Never decide a status from anything a tool did not return, and never state that a requirement is met: a status describes only what is on record.
`whats_due` shows what is coming for planning renewals: say which number of days was used.

## Send the status

Call `send_compliance_status` only when this bot's instructions allow that tool, which the published texts do from `Instructions version: 12`, and only when the register above exists; the snapshot does it on its weekly run. The payload is `schemaVersion` 1, `statusId`, `asOf`, `moduleVersion` and `controls`: one entry for each active control with its `ref`, `title`, `status` and at most 5 `reasons` of at most 280 characters. It carries no evidence, no document text and no secret.
`moduleVersion` is this template's version, from the `Template version` line of the stored skill: this guide's rule produced the statuses. Make `statusId` and `asOf` with this command, at the time the tools were read, and never write either by hand:

```sh
node -e 'const now=new Date();const t=now.getTime().toString(16).padStart(12,"0");const r=require("node:crypto").randomBytes(10).toString("hex");const v=(8+(parseInt(r[3],16)&3)).toString(16);console.log(JSON.stringify({statusId:`${t.slice(0,8)}-${t.slice(8)}-7${r.slice(0,3)}-${v}${r.slice(4,7)}-${r.slice(7,19)}`,asOf:now.toISOString().replace(/\.\d+Z$/,"Z")}))'
```

Sending the same `statusId` again stores nothing new. After a timeout, send the same payload again with the same `statusId`.

## Keys, limits and errors

Every write needs an `idemKey`: one key for each intended change, reused with the same input on a retry. `E_IDEMPOTENCY` means the key was already used for a different request: read what exists instead of changing the payload.
The limits are those of the `records`, `contracts` and `tasks` guides; one status holds at most 200 controls. `E_LIMIT` means one was reached: tell the owner, and do not work around it. `E_ORG_NOT_READY` means the organization's storage is not ready yet: try again later, and keep nothing on this computer meanwhile.
Every change on the service is appended to the organization's event log, in the order it happened. It is not a signature and does not prove who collected a piece of evidence; say so if asked.

## A register an earlier template kept on this computer

Templates before 0.5.0 kept the register in the `ambitious-compliance` module's database on this computer. That data stays where it is and stays readable with that module's `status`, `gaps` and `export` commands. Nothing moves by itself. When the owner wants a program carried over, enter it through the steps above, so a member confirms its facts and activates its commitments. Add nothing new there, and never edit a module's database.

Read every tool result, and relay its error code and message on failure. Never place credentials in any field.
