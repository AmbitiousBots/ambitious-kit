---
name: ambitious-records-for-bots
description: For the Ambitious Bot only. Keep typed records that move through declared stages with the Ambitious Records CLI. Use when the owner asks the Ambitious Bot to track things of one kind, such as requests, orders or applications, with fixed fields, stages and rules for moving between stages.
---

Template version: 0.2.3

# Keep typed records with Ambitious Records

Use the installed `ambitious-records` binary in `/workspace/ambitious/bin`. A record type declares fields, stages and the allowed moves between stages; a record can move only along a declared move, once every field that move requires has a value. It makes no network calls and needs no key.
Pass JSON on stdin or a file path with `--in`. `commands` lists every command.

| When | Command | Input |
| --- | --- | --- |
| The owner describes a new kind of record, or a compatible change to one | `type define` | A type definition: `type`, `version`, `fields`, `stages`, `initial`, `transitions`, `terminal` |
| Checking what types exist | `type list`, `type get` | None, or `type` and optional `version` |
| A new record | `create` | `type`, `fields`, `idem_key`, optional `actor` |
| Field values change | `update` | `id`, `fields`, `idem_key`, optional `actor` |
| Before moving a record | `allowed` | `id` |
| The record moves to another stage | `move` | `id`, `to`, `idem_key`, optional `actor` |
| Finding records | `query` | `type`, optional `stage`, `where`, `order`, `limit` |
| The owner asks what happened to a record | `history` | `id` |

Field kinds are `string`, `text`, `int`, `decimal`, `money`, `date`, `datetime`, `bool`, `enum` and `ref`. Decimal and money values are exact strings such as `"12.50"`, never floating-point numbers. In `update`, a field set to `null` is removed and an omitted field is unchanged.
Agree the type with the owner before defining it. A version is immutable; a later version must be higher and may only add optional fields, values, stages and moves or relax requirements. `E_INCOMPATIBLE` means the change would break existing records: propose a compatible version instead.

Every `create`, `update` and `move` needs an `idem_key`. Choose one stable key per intended action and reuse it, with the same input, when retrying. `E_IDEMPOTENCY` means the key was already used for a different request: inspect the original instead of changing the payload. Do not repeat a timed-out write under a new key before checking whether it succeeded.
Run `allowed` before `move` and tell the owner which fields are still missing. A refused move returns `E_TRANSITION` with `data.allowed` and `data.missing`; fill the missing fields with `update` or choose a declared stage. A terminal stage cannot move again. `E_UNIQUE` means another record holds that value.

`query` filters with `where` entries of `field`, `op` and `value`; the operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains` and `exists`. `limit` defaults to 100, up to 1000. Present counts and totals only as the module returned them; do not add up records yourself beyond what a query returned, and say when a result was cut off by `limit`.
Read the envelope and exit code after every command, and relay `errors[].message` and `errors[].hint` on failure. Never place credentials in record fields.
