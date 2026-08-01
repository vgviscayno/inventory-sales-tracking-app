# 11 — Suppliers

**What to build:** she can finally answer "when did we last get Lucky Me, and from whom?" A delivery can carry a **supplier**, picked or created inline from the sheet without breaking her flow, and the supplier's name shows on the delivery row in a product's ledger — she sees where that stock came from without opening anything. She can also change a delivery's supplier after the fact, so picking the wrong one, or none, is not permanent.

A supplier is **optional**. Stock bought retail, received as a gift, or from someone she does not need to name is still recordable.

A **Suppliers page** lives at `/movements/suppliers`, behind a link on the Movements tab — not a 5th nav tab; the nav bar stops at four. Modelled on the Customers page: create a supplier deliberately when she is not mid-log, tap a row to rename it, keep notes on it ("bought from the palengke, ask for Nita"). She can archive a supplier she no longer buys from so they stop appearing in the picker without erasing the deliveries they supplied, unarchive from the same collapsed Archived section, and delete a junk supplier created by a typo so the picker does not accumulate garbage forever.

Suppliers carry **no extra delete gate** beyond archive-first — `supplierId` is optional, so a dangling reference has a legal absent representation.

**The archived-but-selected exception is the load-bearing detail.** An archived supplier already attached to a delivery must still show **by name, flagged as archived**, when she edits that delivery — editing an unrelated field must never silently blank who supplied it. This means the picker cannot simply filter on the lifecycle fields: it renders `list` (active) plus a `get` on the currently-selected id, merged in the component. That needs no third list mode.

Typing an archived supplier's exact name offers "+ Add as new" and creates a second active row rather than resurrecting the old one — resurrection-by-name-collision is too clever for a widget used mid-log. Unarchive from the Suppliers page instead.

The delivery sheet and the edit sheet **share one supplier picker**, following the existing customer-picker pattern.

Fields are `name` + `notes` only, mirroring customers — no phone, address or contact column, and no per-supplier delivery history page.

**Blocked by:** 07 — Editing and deleting a logged entry; 09 — Entity lifecycle core, and product archive/delete.

**Status:** ready-for-agent

- [ ] A `suppliers` table exists with `name`, optional `notes`, and the lifecycle fields
- [ ] The delivery sheet has a supplier picker; a delivery saves fine with no supplier
- [ ] Typing an unused name offers to create the supplier inline, without leaving the sheet
- [ ] The edit sheet uses the same picker, and a delivery's supplier can be changed or cleared after the fact
- [ ] A delivery row in a product's ledger names its supplier
- [ ] `/movements/suppliers` is reachable from a link on the Movements tab, and there is no 5th nav tab
- [ ] The page creates suppliers and edits name and notes by tapping a row
- [ ] Archive, unarchive and delete work, with the collapsed Archived section from ticket 09
- [ ] Delete requires archive first and has no other gate; deliveries attached to a deleted supplier still render its name
- [ ] The picker excludes archived and deleted suppliers, **except** the currently-selected id, which renders by name flagged as archived
- [ ] Typing an archived supplier's exact name offers "+ Add as new" and creates a second active row rather than resurrecting the old one
