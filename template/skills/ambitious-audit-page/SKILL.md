---
name: ambitious-audit-page
description: For the Ambitious Bot only. Turn an ambitious-audit result into a page the customer can read, showing unseen values as not observed; the module does not render the page. Use after the Ambitious Bot has run an audit's findings and recommendations.
---

Template version: 0.2.2

# Audit page

After `findings` and `recommend`, write a page in the bot's own page tool. The module stores no rendered document.

Start with the scope: the account label, the collection time and the account role. When the role is `unknown`, say so in the first lines, and say that findings and recommendations that depend on the role were withheld or are marked by the module.
Then give the recommendation titles, at most three, each followed by its `why` and the evidence text for its evidence ids. Then list findings that did not become a recommendation. Keep any mark the module put on a finding or a recommendation.
Then list every visibility entry whose `seen` is false, with its `why`, so the customer can see what the snapshot does not cover.

Show a `null` value as "not observed". Never show it as 0, as none or as a dash that could be read as zero, and never state a count, a total or a usage figure the module did not return. Show usage with the unit the module returned, credits or percent.
Keep the page short. Do not paste a transcript. Do not add a finding or a recommendation the module did not return. When unsure what a field of the result means, run `ambitious-audit schema`.
