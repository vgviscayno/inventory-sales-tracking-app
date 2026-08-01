# 05 — Pull-out logging and Movements filters

**What to build:** stock leaving for any reason other than a sale finally has a home. `− Pull-out` sits beside `+ Delivery` on the Movements tab and opens the same sheet, so recording a loss is exactly as easy as recording an arrival. She picks a reason from a fixed short list — **damaged, expired, personal use, given away, other** — so her losses are categorised consistently instead of described differently every time, and can add a freeform note for the detail the category cannot carry ("box fell off the tricycle"). Choosing **other** makes the note **mandatory**: a reason that means nothing on its own is never left unexplained. Several products can leave in one entry, so clearing a shelf of expired stock is one record rather than five. Saving lowers every product's count immediately.

The tab also gains its filters, now that there is more than one kind of thing to filter: **Deliveries & pull-outs** (the default), **Deliveries**, **Pull-outs**, and **Include sales** as an opt-in. Sales are excluded by default because the Register and the customer profile already surface them, and the tab should show what she logged here rather than being flooded.

The reason set is enforced in the pull-out create mutation's args validator rather than as a schema-level union, so changing the list later is a mutation change and not a schema migration.

Stock is allowed to go negative here — the warning that names the count is ticket 08. Nothing rejects a pull-out for lack of stock.

**Blocked by:** 04 — Movements tab and delivery logging.

**Status:** ready-for-agent

- [ ] `− Pull-out` sits beside `+ Delivery` and opens the same sheet component, with all of its mechanics intact
- [ ] The reason picker offers exactly damaged, expired, personal use, given away, other
- [ ] A freeform note is optional for the first four categories
- [ ] The create mutation rejects an `other` pull-out whose `reasonNotes` is missing or empty, and the sheet surfaces that requirement before save
- [ ] The mutation rejects a `reasonCategory` outside the fixed set
- [ ] Saving inserts one `pullouts` header and one negative `stockMovements` row per line, patching each product by the signed delta
- [ ] The pull-out renders as one row on the tab with its net signed change
- [ ] The tab's filter offers Deliveries & pull-outs (default), Deliveries, Pull-outs, and Include sales; sales are hidden until opted in
- [ ] The cache == ledger-sum helper passes after mixed delivery and pull-out sequences
