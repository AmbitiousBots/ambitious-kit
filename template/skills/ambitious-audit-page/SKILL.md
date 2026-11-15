---
name: ambitious-audit-page
description: For the Ambitious Bot only. Turn an ambitious-audit result into a page the customer can read; the module does not render the page. Use after the Ambitious Bot has run an audit's findings and recommendations.
---

# Audit page

After `findings` and `recommend`, write a page in the bot's own page tool. The module stores no rendered document.

Lead with the recommendation titles, at most three, each followed by its `why` and the evidence text for its evidence ids. Then list findings that did not become a recommendation. Then list every visibility entry whose `seen` is false, with its `why`, so the customer can see what the snapshot does not cover.

Keep the page short. Do not paste a transcript. Do not add a recommendation the module did not return.
