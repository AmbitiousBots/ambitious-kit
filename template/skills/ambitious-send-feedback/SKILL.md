---
name: ambitious-send-feedback
description: For the Ambitious Bot only. Build a send_feedback document with ambitious-audit and hand it to the Ambitious service after the customer approves the send. Use when the customer or the Ambitious Bot has feedback for the Ambitious service.
---

Template version: 0.2.4

# Send feedback

Ask the customer what they want to say, or take a note the bot itself needs to send. Run:

```text
ambitious-audit feedback build --in feedback.json
```

`feedback.json` is `{ "text": "...", "from": "customer" }` or `"from": "bot"`. Add `reportId` when the note is about one report. `text` is at most 4000 characters.

The command prints `data.payload`. Send that object with the service's `send_feedback` tool. The send needs the customer's approval for this run. Do not put an organisation id in the payload; the service takes that from the caller.
