import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  products: defineTable({
    name: v.string(),
    sellingPrice: v.number(),
    quantityOnHand: v.number(),
    lowStockThreshold: v.optional(v.number()),
    // Uniform two-state lifecycle, absent meaning active. Only `archivedAt`
    // is exercised in this ticket — `deletedAt` lands with it as one schema
    // edit so soft-delete (the next ticket) doesn't need a second migration.
    // No index: every handler here already collects the whole table and
    // filters in JS (see lifecycle.ts), and at ~100 SKUs that's noise.
    archivedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  }),

  customers: defineTable({
    name: v.string(),
    notes: v.optional(v.string()),
    // Uniform two-state lifecycle, absent meaning active — see lifecycle.ts.
    archivedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  }),

  sales: defineTable({
    customerId: v.optional(v.id("customers")),
    paymentMethod: v.union(v.literal("cash"), v.literal("utang")),
    createdAt: v.number(),
  }).index("by_customer", ["customerId"]),

  payments: defineTable({
    customerId: v.id("customers"),
    amount: v.number(),
    paidAt: v.number(),
    notes: v.optional(v.string()),
  }).index("by_customer", ["customerId"]),

  appSettings: defineTable({
    lowStockThreshold: v.number(),
  }),

  // A delivery or pull-out header groups the movement rows that arrived
  // together, so a five-product shipment reads as one event. Sales already have
  // their own header table. `suppliers` arrives in a later ticket.
  deliveries: defineTable({
    createdAt: v.number(),
  }),

  pullouts: defineTable({
    createdAt: v.number(),
  }),

  stockMovements: defineTable({
    type: v.union(
      v.literal("sale"),
      v.literal("delivery"),
      v.literal("pullout"),
      v.literal("opening"),
    ),
    // The header this row belongs to; undefined for "opening" rows, which
    // stand alone.
    refId: v.optional(
      v.union(v.id("sales"), v.id("deliveries"), v.id("pullouts")),
    ),
    productId: v.id("products"),
    // Signed delta: +delivery/opening, -sale/pullout. `stockMovements.ts` is
    // the only module that writes this table, and the only one that decides
    // the sign — see the notes there.
    quantity: v.number(),
    unitPriceAtSale: v.optional(v.number()), // only when type === "sale"
    reasonCategory: v.optional(v.string()), // only when type === "pullout"
    reasonNotes: v.optional(v.string()), // only when type === "pullout"
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_refId", ["refId"]),
});
