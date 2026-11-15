---
name: ambitious-audit-page
description: For the Ambitious Bot only. Turn an ambitious-audit result into a page the customer can read, showing unseen values as not observed; the module does not render the page. Use after the Ambitious Bot has run an audit's findings and recommendations.
---

Template version: 0.2.5

# Audit page

After `findings` and `recommend`, write a page in the bot's own page tool. The module stores no rendered document.

Lead with the recommendation titles, at most three, each followed by its `why` and the evidence text for its evidence ids. Then list the findings of kind `rule` that did not become a recommendation.

When `mode` is `partial`, say near the top that the bot does not know its role on the account, so advice that depends on the role is held back. Show each finding marked `withheld` as a fact, without advice, and say that telling the bot the role lets the next audit give that advice. Do not guess the role. Recommendations the module did return in partial mode are shown as usual: advice about the bot's own connectors, such as signing one in again, does not depend on the role.

End with what the audit does not cover: every visibility entry whose `seen` is false, with its `why`. The findings of kind `visibility` name the same gaps; list each gap once.

Show a count that is `null` as "not observed". Never show it as 0.

Keep the page short. Do not paste a transcript. Do not add a recommendation the module did not return.
