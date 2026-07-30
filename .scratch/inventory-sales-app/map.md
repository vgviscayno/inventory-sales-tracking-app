# Map: Client's Inventory & Sales Tracking Web-App

## Destination

A locked implementation spec — product/inventory data model, sales transactions, utang (customer credit) running-balance-with-partial-payments, low-stock status flags, and a chosen tech stack — ready to hand off to a build session. Scope for v1 is **online-only**: offline support and PWA/installable behavior are deferred to a later phase, noted but not designed now. Includes one targeted UI prototype for the point-of-sale/utang flow (inventory deducted at sale, payment status tracked separately).

## Notes

- Full requirements context lives in `handoff-plain.md` at the repo root — read it before working any ticket.
- Client: a store owner (name unknown/TBD), communicates in Cebuano via Facebook Messenger. Any client-facing question drafted by a ticket should follow that channel/language convention (short bullets, non-overwhelming).
- Users: 2 — the client and her older sister ("ate"). No complex roles/permissions expected.
- ~100+ SKUs, rough estimate not exact — needs decent search/filter, not a flat list.
- Utang (customer credit): running balance per customer (not per-transaction ledger), must support partial paydowns, and inventory is deducted at the point of sale regardless of payment status.
- Low-stock alerts: simple status indicator (low/ok), not necessarily precise numeric thresholds unless a ticket decides otherwise.
- Device: phone-primary; a tablet is also available and treated as just another device that opens the same website (no multi-device/offline-sync design needed — see Decisions so far).
- Offline support and PWA/installable behavior are explicitly deferred — see Out of scope. Don't let stack or data-model decisions block a later offline layer, but don't design for it now either.
- Use `/grilling` and `/domain-modeling` for decision and research tickets; use `/prototype` for the UI prototype ticket.

## Decisions so far

- [Destination & scope grilling session](../inventory-sales-app/map.md) — destination is a spec (not a built app); tablet resolved as "just another device," no multi-device/offline design needed; offline + PWA explicitly deferred to a later phase, not part of this spec.
- [Tech stack](issues/01-tech-stack.md) — Next.js on Vercel for the frontend; Convex for backend + database (reactive mutations/queries, no separate API layer or Postgres), chosen for solo-dev fit and free-tier hosting.
- [Authentication](issues/02-authentication.md) — no per-user accounts/attribution; single shared passcode gates the whole app via a server-side check (no auth library), with a long-lived session per device.
- [Core data model](issues/03-core-data-model.md) — Product (name, sellingPrice, mutable quantityOnHand, no SKU/category/variants/cost), Customer (name, notes), Sale (optional customerId, paymentMethod cash/utang, computed totalAmount) with SaleItem line items, and a Payment entity as the paydown record; utang balance is computed on read (sum of utang sales minus payments), not stored.
- [Low-stock threshold](issues/04-low-stock-threshold.md) — hybrid: editable global default threshold (single settings record) plus optional per-product override field; low/ok status computed on read, not stored; "out of stock" is a free UI-level inference from quantityOnHand, not a separate state.
- [Partial payment recording](issues/05-partial-payment-recording.md) — Payment gets its own lightweight, editable/deletable record (customerId, amount, paidAt, notes); balance stays fully computed; no per-sale allocation; overpayment allowed unvalidated (balance can go negative).
- [Search/filter approach](issues/06-search-filter-approach.md) — plain text, substring, case-insensitive search on product name only; no category field added to the schema; status-based filters (e.g. low-stock toggle) are a separate concern, out of this ticket's scope.
- [Sale/utang UI prototype](issues/07-sale-utang-ui-prototype.md) — "Register" layout chosen (product grid + cart drawer, cash/utang toggle at checkout); payment recording against an existing balance is a fully separate flow reached from a dedicated Customers tab, never folded into checkout. Prototype at `prototypes/07-sale-utang-flow.html`.

## Not yet specified

- Anything beyond "daily total sales" for reporting/analytics — client only asked for stock levels, daily sales total, and utang tracking; nothing sharper to ticket yet.
- Returns/refunds handling — never mentioned by the client in any requirements round; unknown whether the workflow even exists for this store. Needs a client check before it can be ticketed.
- Interest/fee computation on utang balances, and payment-to-sale allocation to support it — raised while resolving partial payment recording as a possible future phase; not requested by the client and not designed now.
- Convenient bulk-adding of products — raised while scoping the Products tab/page ([ticket 08](issues/08-products-tab-page.md)); ~100+ SKUs is a lot to add one-by-one through a single-product form, but the right mechanism (CSV import, paste-multiple-rows, quick-repeat form) isn't sharp yet, and needs to account for the client's technical comfort level before it can be ticketed.

## Out of scope

- Offline-first / local-first data layer and sync — deferred to a later phase/effort by decision in the destination-grilling session, not designed as part of this spec.
- PWA / installable-on-homescreen behavior — dropped for v1 in the same session; would only make sense alongside offline support.
- Real-time concurrent multi-device editing (e.g. two devices editing the same sale simultaneously) — ruled out; the tablet is just an alternate device used at different times, not a simultaneous second screen.
