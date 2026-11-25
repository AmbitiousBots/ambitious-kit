# Keep typed records on the Ambitious service

This is reference text for the `ambitious-records-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

Typed records live in the owner's organization on the Ambitious service and are read and changed with the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`. A record type declares fields, stages and the allowed moves between stages; a record can move only along a declared move, once every field that move requires has a value.
Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 14`. Under an earlier text call none of them and tell the owner that the instructions update turns this on; the `auto-update` guide says how that update is applied.
Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema.

| When | Tool | Input |
| --- | --- | --- |
| The owner describes a new kind of record, or a compatible change to one | `define_record_type` | `idemKey` and `definition`: `type`, `version`, `fields`, `stages`, `initial`, `transitions`, `terminal` |
| Checking what types exist | `list_record_types` | None |
| A new record | `create_record` | `idemKey`, `type`, `fields` |
| Field values change | `update_record` | `idemKey`, `id`, `fields` |
| Before moving a record, or reading one | `get_record` | `id` |
| The record moves to another stage | `move_record` | `idemKey`, `id`, `to` |
| Finding records | `query_records` | `type`, optional `stage`, `where`, `order`, `limit` |
| The owner asks what happened to a record | `record_history` | `id` |
| Checking an item against a stored workflow's rules | `evaluate_workflow` | `workflowId`, `item`, optional `version`; `record` true with an `idemKey` keeps the evaluation |
| Reading kept evaluations | `list_evaluations`, `get_evaluation` | Optional `workflowId`, or `traceId` |

A type name is lower-case words joined by hyphens, for example `sales-deal`, not underscores. Field and stage names are lower-case words joined by underscores.
Field kinds are `string`, `text`, `int`, `decimal`, `money`, `date`, `datetime`, `bool`, `enum` and `ref`. Decimal and money values are exact strings such as `"12.50"`, never floating-point numbers; dates are `YYYY-MM-DD`. A money field names its currency, an enum field lists its values, and a `ref` field names the record type it points to. In `update_record`, an optional field set to `null` is removed and an omitted field is unchanged; `null` for a required field is refused.
Agree the type with the owner before defining it. A version is never changed; a later version must be higher and may only add optional fields, values, stages and moves or relax requirements. `E_INCOMPATIBLE` means the change would break existing records: propose a compatible version instead. Sending the same definition again changes nothing.

Every `define_record_type`, `create_record`, `update_record` and `move_record` needs an `idemKey`. Choose one key for each intended change and reuse it, with the same input, when retrying: the first answer comes back and nothing changes twice. `E_IDEMPOTENCY` means the key was already used for a different request: read the record instead of changing the payload. Do not repeat a timed-out write under a new key before reading whether it succeeded.
Read the record with `get_record` before `move_record`: it returns the stages the record can move to next and the fields each move still needs, so tell the owner which fields are missing. A refused move answers `E_TRANSITION` with the stages it could move to and the fields still missing; nothing is stored, so fill the fields with `update_record` and move again with a new `idemKey`. A terminal stage cannot move again. `E_UNIQUE` means another record of that type holds that value.

`query_records` filters with `where` entries of `field`, `op` and `value`, combined with and; the operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains` and `exists`. `limit` defaults to 50, up to 100. Present counts and totals only as a tool returned them; do not add up records yourself beyond what a query returned. A query returns no sign that more exist: when as many records came back as `limit`, say that the list may be cut off, or query again from the last one returned.
`evaluate_workflow` walks one item through a workflow the owner's organization has stored and returns each step with the reason for its outcome. By default nothing is kept. A kept evaluation is never changed.

The service holds, for each organization, at most 50 record types and 2,000 records of a type, and a type's version number goes up to 100. `E_LIMIT` means one of those was reached: tell the owner, and do not work around it. A record whose fields are over 8,192 bytes is refused as `E_INVALID_PAYLOAD`. `E_ORG_NOT_READY` means the organization's storage is not ready yet: try again later, and keep nothing on this computer meanwhile. `E_UNAUTHENTICATED` means the connection is not signed in, and `E_FORBIDDEN` means its credential may not use this tool for an organization: for either, follow the `connect` guide of the `ambitious-getting-started` skill.

## Records an earlier template kept on this computer

Templates before 0.5.0 kept typed records in the `ambitious-records` module's database on this computer. That data stays where it is and stays readable with that module's `type list`, `query` and `history` commands. Nothing moves by itself. When the owner wants a type or a record carried over, read it with the module, agree it with the owner, and enter it through the tools above. Add nothing new there, and never edit a module's database.

Read every tool result, and relay its error code and message on failure. Never place credentials in record fields: the service refuses text that holds a private key or a known kind of API key, and that refusal is not the only guard.
