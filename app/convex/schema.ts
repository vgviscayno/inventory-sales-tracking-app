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

  saleItems: defineTable({
    saleId: v.id("sales"),
    productId: v.id("products"),
    quantity: v.number(),
    unitPriceAtSale: v.number(),
  }).index("by_sale", ["saleId"]),

  payments: defineTable({
    customerId: v.id("customers"),
    amount: v.number(),
    paidAt: v.number(),
    notes: v.optional(v.string()),
  }).index("by_customer", ["customerId"]),

  appSettings: defineTable({
    lowStockThreshold: v.number(),
  }),

  // Headers exist only so `stockMovements.refId` has tables to reference; the
  // mutations that write them, and `deliveries.supplierId`, arrive with the
  // tickets that own them.
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
    // undefined for "opening" rows
    refId: v.optional(
      v.union(v.id("sales"), v.id("deliveries"), v.id("pullouts")),
    ),
    productId: v.id("products"),
    // signed: +delivery/opening, -sale/pullout
    quantity: v.number(),
    unitPriceAtSale: v.optional(v.number()),
    reasonCategory: v.optional(v.string()),
    reasonNotes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_refId", ["refId"]),
});
