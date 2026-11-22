# Keep typed records with Ambitious Records

This is reference text for the `ambitious-records-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

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

A type name is lower-case words joined by hyphens, for example `sales-deal`, not underscores. Field and stage names are lower-case words joined by underscores.
Field kinds are `string`, `text`, `int`, `decimal`, `money`, `date`, `datetime`, `bool`, `enum` and `ref`. Decimal and money values are exact strings such as `"12.50"`, never floating-point numbers. In `update`, a field set to `null` is removed and an omitted field is unchanged.
Agree the type with the owner before defining it. A version is immutable; a later version must be higher and may only add optional fields, values, stages and moves or relax requirements. `E_INCOMPATIBLE` means the change would break existing records: propose a compatible version instead.

Every `create`, `update` and `move` needs an `idem_key`. Choose one stable key per intended action and reuse it, with the same input, when retrying. `E_IDEMPOTENCY` means the key was already used for a different request: inspect the original instead of changing the payload. Do not repeat a timed-out write under a new key before checking whether it succeeded.
A write `actor` is 1 to 200 Unicode characters, with no control characters or line breaks, no leading or trailing whitespace, and internal spaces allowed. Nothing is trimmed. The `E_INPUT_SCHEMA` hint states this rule.
Run `allowed` before `move` and tell the owner which fields are still missing. A refused move returns `E_TRANSITION` with `data.allowed` and `data.missing`; fill the missing fields with `update` or choose a declared stage. A terminal stage cannot move again. `E_UNIQUE` means another record holds that value.

`query` filters with `where` entries of `field`, `op` and `value`; the operators are `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains` and `exists`. `limit` defaults to 100, up to 1000. Present counts and totals only as the module returned them; do not add up records yourself beyond what a query returned, and say when a result was cut off by `limit`.
Read the envelope and exit code after every command, and relay `errors[].message` and `errors[].hint` on failure. Never place credentials in record fields.
