# 03 — Opening-balance backfill

**What to build:** the ledger stops starting from nowhere. Every product gets one `opening` movement carrying whatever its count was on launch day, so the number on the shelf is a stated starting point rather than an unexplained one — and so `quantityOnHand` has ledger rows that actually sum to it.

A one-off `internalMutation` invoked by hand (`npx convex run`), not the migrations component: it never re-runs on a schedule and the table is ~100 rows. It reads each product's current `quantityOnHand` and writes one `type: "opening"` row with that value. Because the ledger is empty at that moment, ledger sum == `quantityOnHand` exactly, with nothing to reconcile.

**It is guarded per product** — before inserting, query `by_product` for an existing `opening` row and skip if found. Invoked by hand across two deployments, a double-fire is a plausible slip rather than a theoretical one, and a second `opening` row would silently double the ledger. A per-product guard rather than a global "bail if any `opening` exists" also means a product added after the first run correctly picks up its opening row later.

**It ignores lifecycle entirely** — every product, archived or soft-deleted included. An archived product with 7 on hand needs its `opening` row exactly as much as an active one, or its cached count has no ledger rows summing to it. A soft-deleted product all the more so: its ledger rows are why delete is soft, and it is the one product with no UI left to repair it.

Run against dev, verify a product's ledger sum equals its `quantityOnHand`, then run against prod. This runs *after* the ticket 02 deploy.

**Blocked by:** 02 — Ledger foundation and sale cutover.

**Status:** ready-for-agent

- [ ] Running the backfill writes exactly one `type: "opening"` row per product, with `quantity` equal to that product's cached count and no `refId`
- [ ] Running it a second time is a no-op — no counts change, no rows are added
- [ ] A product created between two runs picks up its opening row on the second run
- [ ] Products with an `archivedAt` or `deletedAt` set are included (test once those fields exist; until then, assert the handler applies no lifecycle predicate)
- [ ] After the run, the cache == ledger-sum helper passes for every product
- [ ] Run against dev and verified, then run against prod
