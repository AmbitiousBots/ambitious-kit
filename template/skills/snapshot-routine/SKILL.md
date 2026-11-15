---
name: snapshot-routine
description: "Run ambitious-audit on a schedule, show the result for review, and send a report only after the customer has approved that tool."
---

# Snapshot routine

Run once a day for the first seven days, then once a week.

1. Collect a document with the audit collector skill and run `snapshot`.
2. On the first run, run `baseline set`. Later, run `diff` against the latest baseline.
3. Run `findings` and `recommend`. Write the review page with the audit page skill.
4. Run `report build` with `reviewRequired` true. Read `data.next`.
5. When `next.kind` is `waitForReview`, stop until a person has looked at the page, then `report mark` with state `reviewed`.
6. When `next.kind` is `send`, call the service's `send_report` tool with `data.payload`. That call needs the customer's approval for this run. Do not approve it ahead of time, and do not send a payload other than the one `report build` returned.
7. If the service accepts the report, `report mark` with state `sent` and then `acked`. If the call fails or times out, `report mark` with state `failed` and follow `next` again. Use the same `reportId` on every retry. Stop when `next.kind` is `gaveUp` or `delivered`.

`at` on each mark is the UTC time of that step.
