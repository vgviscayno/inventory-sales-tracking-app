# Map: Stock Movements (Deliveries & Pull-Outs)

## Destination

A locked implementation spec for tracking inventory movements as first-class records instead of direct `quantityOnHand` edits: deliveries (stock in, with supplier) and pull-outs (stock out, with a reason), unified with sales into one stock-movement ledger. `quantityOnHand` becomes derived/computed from that ledger rather than a stored field anyone can patch directly. Includes a UI prototype for the multi-product logging flow. Ready to hand off to a build session.

## Notes

- This effort extends the data model from [Client's Inventory & Sales Tracking Web-App](../inventory-sales-app/map.md) — read that map's Notes (client context, Cebuano/Messenger convention, device/user constraints) before working any ticket here; they still apply.
- The app is already partly built (Products page, sales/checkout flow shipped) — unlike the original map, tickets here touch **working code** (`app/convex/schema.ts`, `products.ts`, `sales.ts`), not a greenfield spec. Flag anywhere a decision requires migrating existing data.
- Use `/grilling` and `/domain-modeling` for decision tickets; `/prototype` for the UI prototype ticket.

## Decisions so far

- [Destination & scope grilling session](map.md) — destination is a locked spec (not build-in-map); direct `quantityOnHand` editing is removed entirely, replaced by a derived value; deliveries and pull-outs are unified with sales into one stock-movement ledger rather than kept as a separate concern; pull-outs carry both a structured reason category and freeform notes; deliveries track supplier via a dedicated Supplier entity (not freeform text); both deliveries and pull-outs are grouped multi-product entries (header + line items, like Sale/SaleItems); movements are editable/deletable after logging (matches the Payment precedent); historical reconciliation uses a one-time opening-balance snapshot per product at launch, not a full backfill of past sales into the ledger; the logging flow gets a dedicated UI prototype ticket.

## Not yet specified

- Reporting/analytics on top of the unified stock-movement ledger (e.g. total delivered or pulled out over a period, shrinkage by reason) — extends the "reporting beyond daily sales total" fog already noted on the original map; nothing sharper to ticket yet.
- The exact pull-out reason category list (damaged, expired, personal use, given away, etc.) needs client confirmation before it's ticketable as a fixed answer, though the core-data-model ticket can propose a starting set.

## Out of scope

(none yet)
