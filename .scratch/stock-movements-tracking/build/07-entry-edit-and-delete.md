# 07 — Editing and deleting a logged entry

**What to build:** a mistake becomes a record she can fix rather than a number she has to remember was wrong. Tapping an entry — on the Movements tab or on a product's ledger — reopens it in the same sheet she logged it with, so correcting it uses skills she already has. She can change a line's quantity (a typed 70 that should have been 7), add a line for a product she forgot from the shipment, or drop a line for a product that was never in it. Saving moves each product's count by **exactly the difference**, so a correction never double-counts or under-counts.

She can delete a whole entry — a delivery logged twice — behind a clear two-tap confirm, and deleting reverses its effect on every product it touched, so the counts return to what they would have been. Removing the last line and saving tells her this deletes the entry and asks her to confirm; an entry never disappears silently.

When she opens an entry **from a product page**, that product's line is highlighted and the others are marked "also in this entry", so she is not surprised to find herself editing lines for products she was not looking at.

Sale entries are visible in history but not editable here, with a note saying they are edited from the Register — she learns where to go rather than wondering why nothing happens. Opening-balance rows are visible and immutable, with no header entry to open.

**The logging sheet and the edit sheet are one component.** An optional `focusProductId` drives the highlight and the "also in this entry" marking; a `readOnly` flag covers sale entries. The two prototype copies fold into one.

The edit mutation takes the entry id and the **full desired line set**, and diffs against the existing rows: changed quantities patch by the difference, new lines insert, dropped lines delete and reverse their delta. Delete cascades to every row under the header, each reversing its own signed delta, then removes the header; an entry whose lines are all removed on save is deleted through that same path. A projected total is computed per product from the **net** delta across the whole entry, since one entry can touch the same product on more than one line.

**Blocked by:** 05 — Pull-out logging and Movements filters; 06 — Product detail becomes the per-product ledger.

**Status:** ready-for-agent

- [ ] Tapping an entry on the Movements tab or in a product's ledger reopens it in the same sheet, prefilled
- [ ] Changing a line's quantity and saving moves that product's count by exactly the difference, in either direction
- [ ] Adding a line to an existing entry inserts a movement and patches the product
- [ ] Dropping a line deletes its movement and reverses its delta
- [ ] Removing the last line and saving prompts that this deletes the entry, and deletes it on confirm
- [ ] Deleting an entry takes two taps with a clear confirm, cascades to every line, and returns each product's count to what it would have been
- [ ] Opening an entry from a product page highlights that product's line and marks the others "also in this entry"
- [ ] Sale entries render read-only with a note pointing at the Register; the edit mutation rejects them
- [ ] Opening-balance rows are visible and have no entry to open
- [ ] The cache == ledger-sum helper passes after arbitrary sequences of create, edit and delete — including an entry touching the same product on two lines, and an edit that both adds and drops lines
