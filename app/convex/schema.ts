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

  stockMovements: defineTable({
    type: v.union(
      v.literal("sale"),
      v.literal("delivery"),
      v.literal("pullout"),
      v.literal("opening"),
    ),
    productId: v.id("products"),
    // signed: +delivery/opening, -sale/pullout
    quantity: v.number(),
    createdAt: v.number(),
  }).index("by_product", ["productId"]),
});
