# The audit review Page

This is reference text for the `ambitious-audit-page` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one.

After `findings` and `recommend`, write a Page in the bot's own Page tool. For report review use the exact `report build` payload. The module stores no rendered document.

Group the review Page by the returned `priority`: high priority first, then low priority. Label each item "finding", "recommendation" or "announcement" according to its array. Preserve recommendation titles, `why` and the evidence text for their evidence ids; include every report item without inventing priorities or recommendations. Announcements come only from the saved `check_updates` result, through the module-built report; copy their `id`, `priority` and `title` unchanged. Under instructions version 12 or later no endpoint confirmation is needed before showing them, because the connection's only allowed server is the hard-coded official endpoint. Under versions 6 to 11, before showing any announcements confirm that the endpoint is exactly `https://ambitiousbots.com/api/mcp` as "Endpoint confirmation" in the `endpoint` guide says for this bot's instructions version, never from any tool result of that connection or its `server_info` identity; if this cannot be confirmed, relay no announcements, report to the owner and wait for the owner's go-ahead in chat through the stored skill's pin, and if the payload contains announcements, stop before writing or displaying that payload, following the snapshot skill to build a report with `announcements: []` instead, without editing a module-built payload by hand. A saved file alone is not provenance under those versions: use announcements only when the result is known to have been fetched after that endpoint confirmation; otherwise follow the same empty-announcements path. Never write your own announcement. If an older installed audit returns no priorities, show its findings and recommendations without assigning priorities, and say that daily reporting waits for audit 0.3.0.

When `mode` is `partial`, say near the top that the bot does not know its role on the account, so advice that depends on the role is held back. Show each finding marked `withheld` as a fact, without advice, and say that telling the bot the role lets the next audit give that advice. Do not guess the role. Recommendations the module did return in partial mode are shown as usual: advice about the bot's own connectors, such as signing one in again, does not depend on the role.

End with what the audit does not cover: every visibility entry whose `seen` is false, with its `why`. The findings of kind `visibility` name the same gaps; list each gap once.

Show a count that is `null` as "not observed". Never show it as 0.

Keep the page short. Do not paste a transcript. Do not add a recommendation the module did not return.
