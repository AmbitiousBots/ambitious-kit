---
name: ambitious-audit-page
description: For the Ambitious Bot only. Turn an ambitious-audit result into a page the customer can read, showing unseen values as not observed. Use after the Ambitious Bot has run an audit's findings and recommendations.
---

Template version: 0.4.10

# Audit page

After `findings` and `recommend`, write a Page in the bot's own Page tool. For report review use the exact `report build` payload. In the `ambitious-snapshot` routine, write it only on the weekly run.

Read the layout and the announcement rules:

```sh
node "${AMBITIOUS_HOME:-/workspace/ambitious}/bin/ambitious-modules" guide page --json
```

If `guide` fails, first fetch the pinned installer (`ambitious-module-installer` skill).

Hard rules:

- Group by the returned `priority`, high first, and label each item "finding", "recommendation" or "announcement". Include every report item. Never invent a priority or add a recommendation the module did not return.
- Show a count that is `null` as "not observed". Never show it as 0. End with every visibility entry whose `seen` is false or `"partial"`, with its `why`.
- When `mode` is `partial`, say the bot does not know its role on the account. Do not guess the role.
- Announcements come from the module-built report; never write your own. Version 12 or later shows them with no endpoint confirmation; under versions 6 to 11 the `guide page` keeps the confirmation gate before any announcement is shown.
- Do not paste a transcript.
