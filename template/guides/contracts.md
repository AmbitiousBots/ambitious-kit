# Contracts for bots

This is reference text for the `ambitious-contracts-for-bots` skill, printed by the installer's `guide` command. The stored skill has the hard rules; where the two differ, follow the stricter one. Where this text says "this skill", it means that skill.

Use this skill to track what a contract or an amendment obliges. The contract lives in the owner's organization on the Ambitious service: its text as a kept document, what it says as facts, and what it obliges as commitments. All of it is read and changed with the tools of the Ambitious connection, whose server is `https://ambitiousbots.com/api/mcp`.
Call these tools only when this bot's instructions allow them, which the published texts do from `Instructions version: 14`. Under an earlier text call none of them and tell the owner that the instructions update turns this on; the `auto-update` guide says how that update is applied.
Each tool lists its own input schema on the connection, and that schema is the reference for every field: where this text and a schema differ, follow the schema.
The service keeps the text and where each fact was read from. It does not decide what a clause legally means, and neither do you. A person reviews every proposal before anyone relies on it.

## You propose; people confirm

A signed-in member of the owner's organization confirms or rejects a proposal of facts, and activates or rejects a proposed commitment, on the service's `/records` page. No tool does either. Until then a proposed fact is not a fact and a proposed commitment schedules nothing. After proposing, tell the owner once what is waiting on `/records`, and never say it was confirmed unless `get_proposal`, `list_proposals` or `explain_facts` shows it.

## Keep the contract and propose its facts

1. Turn the document into plain text and call `ingest_document` with an `idemKey`, a `kind` such as `contract`, a `title` and the text as `body`. Put where the original lives, such as a Page reference, in `sourceRef`. The same text is kept once: sending it again answers with the first copy and `duplicate` true. Keep the returned `documentId` and `versionSeq`. One version holds at most 200,000 characters.
2. Read the text and call `propose_facts` with an `idemKey`, `kind` `extraction`, the `source` document and its `versionSeq`, and the facts. A fact is a `subjectId` (the contract's `documentId`), a `key` and a `value`, with the `span` of text it was read from: the `start` and `end` character offsets in the kept text. A key is a dotted lower-case name such as `payment.net_days` or `term.start`. Write a date as `"YYYY-MM-DD"` and a number of days as a whole number, so a rule can use them. One proposal holds at most 50 facts, one value for each subject and key.
3. Propose only what the text says. Never paraphrase a value to make it fit, and leave out what the text does not state: an unknown is no fact, never a guess.
4. Read the answer. Values that already match the confirmed facts are left out; when nothing differs the answer is `status` `unchanged` and nothing waits. Otherwise the proposal is `open`, with a `proposalId`.
5. Tell the owner that the proposal waits on `/records`. `list_proposals` shows each one's status: `open`, `applied`, `rejected` or `expired`. A proposal expires when a fact it would replace changed first: read the facts again and propose once more.

`explain_facts` returns the confirmed facts about a contract, and the values they replaced, each with the document version and the text it was read from. Use it to answer "where does this come from". `search_documents` searches the current text of the kept documents for words or a quoted phrase; `list_documents` lists them, newest first.

## Obligations, renewals and deadlines

Each thing the contract obliges is a commitment. Call `propose_commitment` with the contract's `documentId` as `subjectId`, a `title`, who owes it (`obligor`) and to whom (`obligee`), and the `rule` that sets when it is due from the contract's facts, as the `tasks` guide lists: `recurring` for regular work, `before_date` for a notice period before a renewal or an end date, `on_date` for a fixed deadline, `after_signal` for work that follows other work. The answer lists the facts the rule still lacks: propose them, and nothing is scheduled until they are confirmed.
Where one obligation starts another, such as a payment after an accepted delivery, name the signal in `yields` and `needs` and connect the two with `bind_commitments` while the receiving one is still a proposal.
Due work, its completion and its acceptance follow the `tasks` guide: `whats_due`, then `complete_obligation` with the `rev` read. The service works out every date from confirmed facts. Never calculate one yourself.

## Amendments

Keep the amendment as its own document: `ingest_document` with `kind` `amendment` and `amends` set to the contract's `documentId`. Then call `propose_facts` with `kind` `amendment`, the amendment as `source`, and each changed fact with the contract's `documentId` as `subjectId`. `get_proposal` shows each proposed value beside the value it would replace. When a member confirms it, the service works out the contract's commitments again: scheduled and open work whose dates changed is replaced, and finished work is untouched. Check with `whats_due` afterwards and tell the owner what moved.
A corrected text of the same document is a new version, not an amendment: `ingest_document` with `documentId` set.

## Keys, limits and errors

Every `ingest_document`, `propose_facts`, `propose_commitment` and `bind_commitments` needs an `idemKey`. Choose one key for each intended change and reuse it, with the same input, when retrying. `E_IDEMPOTENCY` means the key was already used for a different request: read what exists instead of changing the payload. Do not repeat a timed-out write under a new key before reading whether it succeeded.
The service holds, for each organization, at most 1,000 documents and 100 open proposals. `E_LIMIT` means one of those was reached: tell the owner, and do not work around it. A fact whose value is over 2,048 bytes is refused as `E_INVALID_PAYLOAD`. `E_ORG_NOT_READY` means the organization's storage is not ready yet: try again later, and keep nothing on this computer meanwhile. `E_UNAUTHENTICATED` means the connection is not signed in, and `E_FORBIDDEN` means its credential may not use this tool for an organization: for either, follow the `connect` guide of the `ambitious-getting-started` skill.
The service refuses text that holds a private key or a known kind of API key. That refusal is not the only guard: never ingest a text that holds a credential, and never place one in any field. Remove it and tell the owner what was removed.

## Contracts an earlier template kept on this computer

Templates before 0.5.0 kept an obligation register in the `ambitious-contracts` module's database on this computer. That data stays where it is and stays readable with that module's `in-force` and `due` commands. Nothing moves by itself. When the owner wants a contract carried over, keep its text and propose its facts and commitments through the tools above, so a member confirms them. Add nothing new there, and never edit a module's database.
