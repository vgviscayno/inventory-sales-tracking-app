Type: grilling
Status: open

## Question

Nail down the exact schema for the unified stock-movement ledger, given the destination decisions already made: sales, deliveries, and pull-outs all become movements in one ledger; `quantityOnHand` is derived from it rather than stored/patched; deliveries and pull-outs are grouped multi-product entries (a header + line items, like `sales`/`saleItems`); movements are editable/deletable; supplier is a dedicated entity; historical reconciliation is a one-time opening-balance snapshot per product at launch.

Specifically resolve:
- Table shape: one flat `stockMovements` table tagged by `type` (`sale`/`delivery`/`pullout`/`opening`) with a nullable `refId` back to a header row, vs. separate `deliveries`/`pullouts` header tables each with their own line-item tables (mirroring `sales`/`saleItems`) plus a movement row per line item for the derived-quantity computation.
- How `sales.create` (`app/convex/sales.ts`) changes to write into this ledger instead of (or alongside) directly patching `quantityOnHand` — and whether `saleItems` still exists separately or folds into the ledger.
- Whether `quantityOnHand` is computed fully on read (sum of all movements per product, query-time) or maintained as a cached/denormalized field updated transactionally by every movement — given ~100+ SKUs, is summing on every `products.list` call fine, or does it need a stored running total updated per-mutation?
- Supplier entity fields — likely just `name` (+ optional notes/contact), matching the minimalism of the existing `Customer` entity.
- Pull-out reason: propose a starting fixed category list (e.g. damaged, expired, personal use, given away, other) — final list confirmed by [ticket 02](02-pullout-reason-categories.md), which this doesn't block on since the schema just needs a `v.union(v.literal(...))` or similar shape, not the final wording.
- Editable/deletable semantics for a movement: does editing a delivery/pull-out line quantity need to also correct `quantityOnHand` (if cached) or just the ledger sum (if computed)?
- The opening-balance snapshot: one `type: "opening"` movement per product at migration time, set to today's actual `quantityOnHand` value, so the ledger sum reconciles from that point forward without reconstructing pre-launch history.
