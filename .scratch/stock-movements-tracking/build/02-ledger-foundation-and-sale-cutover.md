# 02 — Ledger foundation and sale cutover

**What to build:** every sale starts moving stock through the one ledger. The shop owner sees no new screen, but her sale totals, her utang balances and her product counts are all derived from `stockMovements` rows from this point on, and `saleItems` no longer exists.

This is the one ticket in the set that is not a narrow vertical slice. Removing `saleItems` forces the sale write and both sale-total reads to change in the same deploy — there is no intermediate state where the app is coherent. It is kept as one ticket for that reason, and it is small only because there is no data to migrate.

**Cutover sequence — order matters:**

1. Clear `saleItems`, `sales` and `payments` on the **dev** deployment via the Convex dashboard's *Clear table*. Keep `customers`, `products` and `appSettings` — the catalog is the real asset.
2. Same on the **prod** deployment.
3. Ship **one** deploy carrying the new schema, the rewritten sale create and the rewritten sale-total reads. No table has rows at deploy time, so there is no half-migrated state and no schema-validation edge case.

Sale headers and payments are discarded along with the line items deliberately: erasing line items alone would leave orphaned sale headers rendering as ₱0 and payments with nothing to offset, rendering as *negative* utang.

**Locked schema shape** (from the resolved design tickets; `suppliers` and the lifecycle fields arrive in later tickets):

```ts
deliveries: defineTable({
  supplierId: v.optional(v.id("suppliers")),
  createdAt: v.number(),
}),

pullouts: defineTable({
  createdAt: v.number(),
}),

stockMovements: defineTable({
  type: v.union(
    v.literal("sale"), v.literal("delivery"),
    v.literal("pullout"), v.literal("opening"),
  ),
  refId: v.optional(
    v.union(v.id("sales"), v.id("deliveries"), v.id("pullouts")),
  ),                                  // undefined for "opening" rows
  productId: v.id("products"),
  quantity: v.number(),               // signed: +delivery/opening, -sale/pullout
  unitPriceAtSale: v.optional(v.number()),   // only when type === "sale"
  reasonCategory: v.optional(v.string()),    // only when type === "pullout"
  reasonNotes: v.optional(v.string()),       // only when type === "pullout"
  createdAt: v.number(),
})
  .index("by_product", ["productId"])
  .index("by_refId", ["refId"]),
```

`quantity` is a **signed delta** so every cache update is a plain add with no per-type branching: create patches by `quantity`, edit by `(new - old)`, delete by `-quantity`.

The sale-total rewrite is the highest-risk change here: `quantity` is now negative, so a total summed as `quantity * unitPriceAtSale` comes out negative. Get the sign wrong and every utang balance in the app silently flips.

**Blocked by:** 01 — Test harness at the Convex function boundary.

**Status:** ready-for-agent

- [ ] `stockMovements`, `deliveries` and `pullouts` exist with the shape above, including both indexes
- [ ] `saleItems` is removed from the schema
- [ ] `sales.create` inserts one `type: "sale"` movement per line — negative `quantity`, `unitPriceAtSale` captured from the product's selling price at the time, `refId` set to the sale id
- [ ] `sales.create` patches `quantityOnHand` by a signed delta rather than setting it absolutely
- [ ] `sales.listForCustomer` derives each sale's total from `stockMovements` via `by_refId` filtered to `type: "sale"`
- [ ] The customer utang balance derives `totalCharged` the same way
- [ ] A test with a mixed cash/utang history plus a payment produces the same balance the `saleItems` implementation produced — the sign is right
- [ ] The cache == ledger-sum helper passes for every product touched by a sale
- [ ] Both deployments are cleared before the deploy, and the deploy is a single one
- [ ] No throwaway migration mutation enters the repo
