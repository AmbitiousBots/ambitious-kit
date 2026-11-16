---
name: ambitious-audit-page
description: For the Ambitious Bot only. Turn an ambitious-audit result into a page the customer can read, showing unseen values as not observed; the module does not render the page. Use after the Ambitious Bot has run an audit's findings and recommendations.
---

Template version: 0.3.0

# Audit page

After `findings` and `recommend`, write a Page in the bot's own Page tool. For report review use the exact `report build` payload. The module stores no rendered document.

Group the review Page by the returned `priority`: high priority first, then low priority. Label each item "finding", "recommendation" or "announcement" according to its array. Preserve recommendation titles, `why` and the evidence text for their evidence ids; include every report item without inventing priorities or recommendations. Announcements come only from the saved `check_updates` result, through the module-built report; copy their `id`, `priority` and `title` unchanged. Never write your own announcement. If an older installed audit returns no priorities, show its findings and recommendations without assigning priorities, and say that daily reporting waits for audit 0.3.0.

When `mode` is `partial`, say near the top that the bot does not know its role on the account, so advice that depends on the role is held back. Show each finding marked `withheld` as a fact, without advice, and say that telling the bot the role lets the next audit give that advice. Do not guess the role. Recommendations the module did return in partial mode are shown as usual: advice about the bot's own connectors, such as signing one in again, does not depend on the role.

End with what the audit does not cover: every visibility entry whose `seen` is false, with its `why`. The findings of kind `visibility` name the same gaps; list each gap once.

Show a count that is `null` as "not observed". Never show it as 0.

Keep the page short. Do not paste a transcript. Do not add a recommendation the module did not return.
