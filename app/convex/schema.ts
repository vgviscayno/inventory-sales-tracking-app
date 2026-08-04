import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  products: defineTable({
    name: v.string(),
    sellingPrice: v.number(),
    quantityOnHand: v.number(),
    lowStockThreshold: v.optional(v.number()),
  }),

  customers: defineTable({
    name: v.string(),
    notes: v.optional(v.string()),
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
    // Signed delta: +delivery/opening, -sale/pullout. Only `recordMovement`
    // in `stockMovements.ts` decides the sign — see the note there.
    quantity: v.number(),
    unitPriceAtSale: v.optional(v.number()), // only when type === "sale"
    reasonCategory: v.optional(v.string()), // only when type === "pullout"
    reasonNotes: v.optional(v.string()), // only when type === "pullout"
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_refId", ["refId"]),
});
