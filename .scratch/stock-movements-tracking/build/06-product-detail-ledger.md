# 06 — Product detail becomes the per-product ledger

**What to build:** the answer to "why does it say 7?" sits directly under the 7. The product detail page lists every movement for that product — sales alongside deliveries and pull-outs, so nothing that changed the number is missing from the explanation of the number. Each row shows what happened, the time, its context, the signed change and **the running balance after it**, so she can scroll to the exact point where the count became wrong. Rows are grouped under day headings, newest first, so "what happened yesterday" is near the top where she looks. The opening balance is the first, oldest row: the ledger starts from a stated number rather than from nowhere.

Context is per type — a delivery names its supplier (once suppliers exist), a sale shows its line total so the ledger reads consistently with the money surfaces, a pull-out shows its reason category and note. She can see why stock left without opening anything.

Sales dominate the ledger by row count, so this list is long from day one: it is windowed.

And the **quantity-on-hand input disappears from the product form**, replaced by a line pointing at logging. This is the point of the whole feature — she should never again be able to fix a number in the one way that destroys the record of why it was wrong.

Running balance is computed by summing oldest-first, then reversing for display.

**One thing to confirm while here:** the product detail page queries the product list for what looks like a duplicate-name check. A collision against an archived product is a real case (archive "Coke 1.5L", later re-add it), so it probably wants the with-archived view and a warning rather than a block. Worth a moment's thought rather than a silent default — the lifecycle work lands in ticket 09.

**Blocked by:** 03 — Opening-balance backfill; 04 — Movements tab and delivery logging.

**Status:** ready-for-agent

- [ ] The product detail page lists every `stockMovements` row for that product, newest first, under day headings
- [ ] Sale, delivery, pull-out and opening rows all appear
- [ ] Each row shows an event label, the time, the signed change and the running balance after that movement
- [ ] A sale row shows its line total; a pull-out row shows its reason category and note; a delivery row has its supplier slot (populated in ticket 11)
- [ ] The opening-balance row is the oldest row in the list
- [ ] The list is windowed and stays responsive with a long history
- [ ] The product form no longer has a quantity-on-hand input; a line points at logging instead
- [ ] Creating a product from the form no longer sets a count directly
- [ ] The running balance of the newest row equals the product's `quantityOnHand`
