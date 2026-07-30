Type: grilling
Status: resolved

## Question

How is the "low stock" vs. "ok" status determined for a product?

The client wants a simple status indicator, not necessarily precise numeric thresholds (per handoff-plain.md). Options:
- A single global threshold applied to every product (e.g. "low" below 10 units) — simplest, but wrong for products with very different natural quantities (e.g. a product normally stocked at 5 vs. one normally stocked at 200).
- A per-product manual threshold field the client sets once per product — more accurate, but adds a data-entry step for 100+ SKUs.
- Some derived/relative measure (e.g. percentage of a "typical stock" baseline) — more sophisticated, probably overkill given the client's own framing of the need ("aware whether a product is still well-stocked or running low", not precise levels).

Settle which mechanism to use, and if per-product, whether it's required at product-creation time or optional with a sensible default.

## Answer

**Mechanism: hybrid global default + optional per-product override.**

- A **single editable settings record** (e.g. one `AppSettings` document with a `lowStockThreshold` field) holds a global default threshold, seeded with a starting guess (e.g. 10 units). Editable without a code deploy, since the client is non-technical and communicates over Messenger — a wrong default should be a "change the number" conversation, not a code change.
- `Product` gains an **optional, nullable** `lowStockThreshold` field. When set, it overrides the global default for that product. When unset, the global default applies. This costs zero data-entry at product creation — the client can add precision later, only for the SKUs where the global default is visibly wrong (e.g. fast movers, oddly-sized stock).
- **Status is computed at read time, never stored**: `"low" | "ok"`, comparing `quantityOnHand` against the product's own threshold if set, else the global default. Mirrors the "computed over stored" direction already chosen for `Sale.totalAmount` and the utang balance in ticket 03.
- **Binary status only** — no separate "out of stock" state. `quantityOnHand === 0` is already derivable from the existing field settled in ticket 03; any "out of stock" UI treatment is a display-layer check on that field, not a data-model addition.
