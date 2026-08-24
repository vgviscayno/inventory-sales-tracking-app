# Inventory & Sales Tracking

## Language

### Domain vocabulary

**Unit**:
A way a product can be counted and transacted — `piece`, `tray`, `sack`. Every product has at least one, and may have several: eggs are handled both as pieces and as trays. A Unit's label is its singular form, and is not necessarily what reaches the screen: wherever a label stands next to a count it is inflected to agree with it, so a label recorded as `tray` reads "1 tray" and "3 trays". Labels that take no English plural are exempt and stand unchanged at every count — measures written as abbreviations, and Tagalog nouns, which do not inflect for number at all, so `2 kg` and `3 sako`.
_Avoid_: measure, UOM, packaging

**Base unit**:
The single Unit a product's stock is counted in. Every quantity the app holds about that product's stock — how much is on hand, the Low-stock threshold set on it — is expressed in it. Which Unit plays this role is a decision recorded per product, not inferred from the Units themselves.
_Avoid_: piece (that is one product's Base unit, not the concept), smallest unit, primary unit

**Base equivalent**:
How many Base units one of a given Unit amounts to — 1 for the Base unit itself, 30 for an egg tray. It belongs to the pairing of a product and a Unit: a tray of eggs and a tray of tomatoes need not agree. A product's Base unit is expected to be fine enough that everything the store actually transacts comes to a whole number of it — rice counted in grams rather than kilos, so that selling 1.7 kg lands exactly. Quantities are allowed to be decimal where the store genuinely sells that way; what the Base unit's fineness buys is that the stock ledger itself never has to hold a fraction.
_Avoid_: conversion factor (silent about direction), multiplier, ratio

**Default unit**:
The Unit a product leads with — the one its price is quoted in on listings, and the one preselected when someone logs a movement against it. A separate decision from the Base unit, because what a product is counted in and what it usually changes hands in need not be the same. Where no choice is recorded, the Base unit stands in. It is also the Unit the shop-wide Low-stock threshold counts, and the Unit a product's own threshold is preselected against when one is first set.
_Avoid_: primary unit, main unit (both blur into Base unit)

**Low-stock threshold**:
The count at or below which a product reads as low. A threshold names the Unit it is counted in — "warn me on Eggs Medium under 10 trays" — chosen from that product's own Units and separate from the one it sells in, so a product quoted by the piece can still be watched by the tray. The Unit belongs to the threshold rather than to the product: the two are set together and cleared together, and the Unit is only ever a way of reading the count. The app holds the count in Base units, so what a later change moves is the reading and never the number. Change what a tray amounts to and the threshold is still 300 eggs, now read as 15 trays. Take the tray off the product and the same 300 eggs read in its Default unit. A product may carry its own threshold; where it does not, the shop-wide threshold stands in, and that one number is read as a count of each product's own Default unit, so a single `10` means "under ten of however I sell it" on every product at once. A negative count is not low but wrong, and reads as its own status. An archived product carries no status at all.
_Avoid_: reorder point, par level, minimum stock, safety stock (each names a stock-control practice the shop does not run)

**Remainder reading**:
Reading a stock figure against a Reading ladder — a whole count of each Denomination on the ladder in turn, with what is left over falling to the next: "3 cases, 5 pcs" rather than "1085 pcs". A Denomination that comes to zero is not spoken. Whether a product's figures read this way is a per-product choice, and it applies to all of them at once, so a product never mixes the two readings across a screen. It is a way of reading a quantity, never a way of holding one.
_Avoid_: breakdown, mixed units, cascade

**Reading ladder**:
The Denominations a product's stock is spelled out in, ordered by descending Base equivalent and always ending at its Base unit. It is chosen per product from that product's own Units; no ladder means the stock reads as a plain Base-unit figure. The Base unit is on the ladder whether or not it was chosen, because it is the only Denomination fine enough to hold whatever the coarser ones leave behind. Nothing requires the Denominations to divide into each other — a sack of 100 pieces and a bundle of 12 sit on one ladder quite happily, and the reading stays exact — so a bundle count of 8 does not mean "nearly a sack".
_Avoid_: unit list, hierarchy, conversion chain (all imply the Denominations nest, which they need not)

**Denomination**:
A Unit a product's stock is read in — one entry on that product's Reading ladder. Each Denomination takes its whole count of a figure before what is left falls to the next, and the Base unit is the last of them whether or not it was chosen. A Unit is a Denomination only against a particular product's ladder: `tray` is an ordinary Unit on a product whose stock does not read that way. Denominations need not divide into each other, the way a 20-peso note and a 5-peso coin do not.
_Avoid_: rung (the ladder's own jargon, which nobody in the shop would say), tier, level, step (all imply the Denominations nest)

**Unit quantity**:
The amount recorded against a movement, expressed in the Unit the person actually chose — "2 trays" is a Unit quantity of 2 against the Unit `tray`. What the stock ledger reasons about is the Base-unit amount this comes to; the Unit and Unit quantity are kept so the movement can be read back the way it was entered.
_Avoid_: quantity (ambiguous — say whether it is in Base units or in a chosen Unit)

**Ledger**:
The `stockMovements` rows that account for a product's count — every Movement that ever moved it, read newest first, each carrying the running balance immediately after it. The count held on the product itself is a cache of the ledger's sum; where the two disagree the ledger is the authority, and the balance is folded from the rows rather than walked backwards from the cache so a drifted cache cannot silently confirm itself. Names the stock record only. A customer's money record is an Account history.
_Avoid_: history, audit log, journal, transaction log; "the ledger" unqualified for a customer's utang record

**Movement**:
One ledger row: one product, one Unit, one Unit quantity, one direction. Its signed Base amount is derived on every read from the Unit quantity and the Base equivalent snapshotted when it was written; the direction comes from the movement's type, never from a sign a caller supplied. The Unit and Unit quantity are what let it read back the way it was entered; the Base amount is what the ledger reasons about. Every Movement belongs to an Entry — there is no free-standing row.
_Avoid_: transaction (collides with the database sense), stock change, adjustment, delta (that is the signed number a Movement carries, not the Movement)

**Entry**:
One logged event — a Delivery, a Pull-out, or a Sale — together with the Movements filed under it. It is what someone saves in a single gesture and what they reopen to edit or delete: the header holds what belongs to the whole event (when it happened, the supplier, the customer and payment method, the pull-out's reason), and each Movement under it holds one product. A Movement seen from its Entry is called a Line — the same row, not a second thing — so an Entry's Lines and its Movements are the same set counted from different ends.
_Avoid_: batch, group, document (Convex's word for any row), transaction; "line item" as a distinct concept from Movement

**Delivery**:
An Entry that brings stock in — every Movement under it adds to its product's count. Its supplier is optional, because stock bought retail or received as a gift is still worth recording with nobody named. A Line may also create the product it names, so a product first seen on an arriving shipment does not have to be added separately beforehand.
_Avoid_: purchase (names money changing hands, which a delivery does not record), restock (a delivery of a product never carried before is not a re-stock), receiving, stock-in, goods receipt

**Pull-out**:
An Entry that takes stock out for any reason other than a Sale — damaged, expired, personal use, given away, or other, which must carry a note. Every Movement under it subtracts. The reason is the point of the Entry: without one, stock leaving the shelf would be indistinguishable from a Sale nobody rang up. The term is the shop's own, and covers cases accounting words do not.
_Avoid_: write-off (accounting's word, and wrong for personal use and given away), shrinkage (means unexplained loss — a pull-out is always explained), wastage, removal, stock-out (reads as "out of stock")

**Sale**:
An Entry that takes stock out in exchange for money — every Movement under it subtracts and carries the price of the Unit it was rung up in at the moment it was rung up, so what the sale charged stays derivable from its own rows rather than stored beside them. A sale is paid in cash or on Utang; an Utang sale must name a customer, a cash sale need not.
_Avoid_: order (nothing is placed and later fulfilled — a sale is recorded once it has already happened), invoice, checkout, transaction, purchase (that is the shop buying, i.e. a Delivery)

**Utang**:
A Sale taken on credit and settled later — one of the two payment methods a Sale carries, and the word used at the counter. It stays untranslated because every English near-synonym asserts something the shop does not mean: there is no limit, no interest, no term, and no instrument. An Utang sale must name its customer, since otherwise there is nobody for the debt to attach to. Its effect lands on that customer's Account history; stock leaves the Ledger exactly as it does on a cash sale.
_Avoid_: credit (implies an extended facility with a limit), debt, receivable, IOU, tab, "on account"

**Payment**:
Money a customer hands over against what they owe, recorded on its own with an amount and a date and never attached to a particular Sale. Payments are netted against the total of that customer's Utang sales to give their balance, so no individual Sale is ever paid off, marked settled, or closed.
_Avoid_: settlement (that is the balance reaching zero, not the act of paying), repayment, remittance, transaction; "paying off a sale" — a payment is against the balance, never against a Sale

**Account history**:
The Utang sales and Payments a customer's balance is computed from — the money-side counterpart to the Ledger, kept apart from it because the two share no rows and answer different questions. The balance is derived on read, never stored: charges less payments. It is meaningful in both directions — positive is money owed to the shop, negative is an overpayment the shop owes back — and a customer counts as settled only at exactly zero.
_Avoid_: ledger unqualified (that is the stock record), statement, account (ambiguous with a login), running balance (that is a stock ledger row's figure; a customer's balance has no per-row equivalent)

**Negative projection**:
A product that a pending save would leave below zero, judged on the Entry's whole net effect per product rather than line by line — so two Lines naming one product, or a raised Line beside a dropped one, cannot cancel out unseen. It is always a warning and never a refusal: the count on screen can simply be wrong, and blocking the save would leave the Ledger further from the shelf than letting it through. Saving past one is a single deliberate gesture per Entry, recorded so that a surface which skipped the warning still cannot drive stock negative with nobody looking.
_Avoid_: negative stock (names the resulting state, not the check), insufficient stock (implies a refusal), stock-out; oversold, where the cause is not a Sale

**Oversold**:
A Negative projection caused by a Sale — more of a product rung up than the count says is on the shelf. The narrower of the two terms: a Pull-out, or an edit to a Delivery, can produce a Negative projection with nothing having been sold at all.
_Avoid_: Negative projection where a Sale is specifically meant (Oversold is the more precise term), overdrawn, short

**Archive**:
Hiding a product, customer, or supplier from every place it can be picked, while leaving untouched everything it has already been named on. It is one of two lifecycle states — both soft, each a timestamp whose absence means active — and it is the reversible one, so it is never gated: the customer she most wants off the main list is often the one who owes money. Delete is the other, one-way, and gated both on being archived first and on whatever the entity may not be deleted while still holding — stock on hand for a product, a nonzero balance for a customer. Neither state touches a Ledger or an Account history; archiving changes visibility, never arithmetic.
_Avoid_: deactivate, disable, hide, soft-delete (Delete is soft too, so the word does not separate the two states), remove (the mutation is spelled `remove`, but the concept is Delete)

### Process vocabulary

Git-workflow terms, not domain terms — kept here because `docs/agents/domain.md` names `CONTEXT.md` as the one glossary this repo has. See `docs/git-workflow.md` for the full workflow these terms describe.

**Project branch**:
The long-lived integration branch for a Linear project whose tickets carry the `build` label, `project/<short-slug>`. Build work accumulates here and lands on `dev` once, whole, when every build ticket is done.
_Avoid_: feature branch, integration branch (on its own — ambiguous with `dev`)

**Ticket branch**:
The short-lived branch for one build ticket, cut from the project branch tip and squash-merged back into it.
_Avoid_: feature branch, work branch

**Build ticket**:
A Linear issue carrying the `build` label — one slice of a project delivered via a ticket branch.
_Avoid_: task, story

**Discovery ticket**:
A `prototype` or `grilling` ticket that answers a design question with throwaway code. Never merged back — the answer lands in Linear as a comment; the code is deleted when the ticket is Done.
_Avoid_: spike, exploration ticket

**Escape hatch**:
The path for non-feature work (repo docs, tooling, unrelated bug fixes): branch off `dev`, land on `dev` directly, never touching a project branch. Keeps unrelated work from being held hostage for the length of a build project.
_Avoid_: fast path, side branch
