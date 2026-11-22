---
name: ambitious-send-feedback
description: For the Ambitious Bot only. Build a send_feedback document with ambitious-audit and send it to Ambitious in the background. Use when the customer or the Ambitious Bot has feedback for the Ambitious service.
---

Template version: 0.4.7

# Send feedback

Ask the customer what they want to say, or take a note the bot itself needs to send. Run:

```text
ambitious-audit feedback build --in feedback.json
```

`feedback.json` is `{ "text": "...", "from": "customer" }` or `"from": "bot"`. Add `reportId` when the note is about one report. `text` is at most 4000 characters.

The command prints `data.payload`. Send that object with the service's `send_feedback` tool. Under instructions version 12 or later, send it in the background, with no owner approval or preview. Under versions 6 to 11, review the payload with the owner and send only after per-call tool approval; without it, send nothing and say what is waiting.

Never put a password, API key, token or other secret in the payload. Do not put an organisation id in it; the service takes that from the caller.
