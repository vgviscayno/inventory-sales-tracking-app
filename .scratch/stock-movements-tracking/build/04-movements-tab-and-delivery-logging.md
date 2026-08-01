# 04 — Movements tab and delivery logging

**What to build:** the shop owner can log a restock. A **Movements** tab appears as the 4th item in the main nav, reachable in one tap from anywhere, with `+ Delivery` at the top. Tapping it opens a bottom sheet that looks and works like the Register checkout sheet she already uses: she searches a product by typing part of its name, adds it, adjusts the quantity with `−` / `+` steppers or types it directly when it is large, removes a line she mis-tapped, and adds as many products as arrived in the shipment. If her search matches nothing, the sheet offers "+ Add *X* as new product" — the new line is badged as new and asks for a selling price inline, so a product can never be created without one.

Saving raises each product's count by its line quantity and the delivery appears as **one row** on the tab — a five-product delivery reads as one delivery, not five events. Rows show the time, the product count, the product names and the net signed change, grouped under day headings with the newest first, and the list is windowed so it stays fast to scroll a year in.

The Movements tab is the **sole logging entry point**. The floating pill pair over the Products grid that an earlier prototype proposed is dropped.

Suppliers, pull-outs, editing and the negative-stock warning are all later tickets. A delivery saved here has no supplier attached yet.

**The prototypes are the visual reference, not the code.** The variants on `prototype/stock-movements-logging-flow` and `prototype/movement-history-surface` back these decisions; neither branch is merged, and the ledger module on the latter is the reference for the query shapes (entries newest-first with their lines joined, an entry total helper, per-type label helpers).

Where this ticket says "like the checkout sheet", it means it fairly literally — the transferred muscle memory is the justification for the whole logging design.

**Blocked by:** 02 — Ledger foundation and sale cutover.

**Status:** ready-for-agent

- [ ] Movements is a 4th nav tab beside the existing three, reachable from every screen
- [ ] `+ Delivery` sits at the top of the tab and opens a bottom sheet modelled on the Register checkout sheet
- [ ] Typing part of a name searches the product catalog; picking a result adds a line
- [ ] Each line has `−` / `+` steppers and accepts a directly typed quantity
- [ ] A line can be removed before saving
- [ ] A search matching nothing offers "+ Add *X* as new product"; that line is badged as new and requires a selling price inline before the entry can save
- [ ] Saving inserts one `deliveries` header and one positive `stockMovements` row per line, patching each product by the signed delta in the same transaction
- [ ] The saved delivery renders as one row: label, time, product count, product names, net signed change
- [ ] Rows are grouped under day headings, newest first, and the list is windowed
- [ ] The cache == ledger-sum helper passes after any sequence of delivery creates, including two lines for the same product in one entry
