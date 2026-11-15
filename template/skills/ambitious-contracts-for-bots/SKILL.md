---
name: ambitious-contracts-for-bots
description: For the Ambitious Bot only. Maintain a literal-quote obligation register with the Ambitious Contracts CLI, apply amendments, inspect due work and hand suggested payloads to the tasks module. Use when the Ambitious Bot is asked to track obligations from a contract or an amendment.
---

Template version: 0.2.2

# Contracts for bots

Use this skill to track obligations from a contract or amendment. The module verifies literal evidence and dates. It does not decide what a clause legally means. Have a person review the proposed interpretation before relying on it.

## Start

Run `ambitious-contracts selfcheck`, then `ambitious-contracts commands`. On a non-hosted machine, set `AMBITIOUS_HOME` to the intended persistent module directory. Pass a fixed `--now` and `--seed` when reproducing a result. Every output is one JSON envelope; inspect `ok`, `errors` and `data`.

## Register obligations

1. Convert documents to UTF-8 text and call `ingest` with title, party and path. Supply effective dates when they differ from the current UTC date.
2. Normalize the source with Unicode NFC, collapse whitespace to one space, and trim the ends when preparing quotations. Submit exact quotes from that text through `propose`; quotes themselves are not normalized by the module.
3. Read both `accepted` and `rejected`. A successful envelope can include rejected proposals. For an ambiguous quote, include more surrounding text; for an absent quote, copy from the source. Never paraphrase evidence to make it pass.
4. Check `in-force` at the intended date. After an uncertain response, inspect it before repeating `propose`, which creates new obligations.

## Due work

Run `due` with `withinDays` or `{}` for the current day. It includes overdue work and accounts for each obligation's lead time. Forward each `suggestedTask` unchanged to `ambitious-tasks add`. Keep its `idem_key`, which identifies this obligation and due date. Do not invent a replacement key on retries. Do not write another module's database.

After work is done, call `complete` with its obligation ID and completion date. Each call completes one occurrence. Early completion is allowed; late completion leaves later missed occurrences available. Inspect the returned `next_due` instead of calculating dates yourself.

## Amendments

Call `amend` with the contract ID, amendment text path, clause reference and effective date. Omitted replacements end affected obligations. To restate an obligation, include its current ID, new terms and a unique quote from the amendment source. The entire amendment fails if any replacement quote is invalid.

Use `in-force` on both sides of the effective date to inspect the change. Earlier overdue work can remain active on the old version, but it stops recurring at the amendment boundary. Review tasks already handed to the tasks module and cancel or update them there as needed.

## Evidence and errors

Command shapes, the recurrence grammar and error hints are documented at https://github.com/AmbitiousBots/ambitious-contracts#readme; that documentation is not a file on this computer, and every error also carries its own hint. Dates are calendar dates; stored quote offsets are UTF-16 indices into normalized text. The module stores history but does not render documents. A bot can use the returned data to write a document for review. The module makes no model call and needs no API key.
