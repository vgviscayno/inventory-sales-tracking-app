import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// A single Unit a product can be counted and transacted in — piece, tray,
// kilo. Shared between the schema and `products.ts`'s args validators, so a
// field added to a Unit only has to be declared once.
export const unitValidator = v.object({
  label: v.string(),
  baseEquivalent: v.number(),
  price: v.number(),
});

export default defineSchema({
  products: defineTable({
    name: v.string(),
    // Every product has at least one. `baseEquivalent` is how many Base units
    // one of this Unit amounts to (1 for the Base unit itself, 30 for an egg
    // tray) — see docs/adr/0003-base-unit-storage.md.
    units: v.array(unitValidator),
    // Which `units[].label` is this product's Base unit — recorded
    // explicitly rather than inferred from a `baseEquivalent` of 1. Locked
    // once the product has movements — see docs/adr/0004-base-unit-locked.md.
    baseUnitLabel: v.string(),
    // Which `units[].label` this product leads with — the Unit its listed
    // price is quoted in and the Register preselects. A separate decision
    // from the Base unit (see CONTEXT.md's "Default unit"), and unlocked:
    // absent means "no choice recorded", and every reader falls back to the
    // Base unit rather than treating absence as its own case.
    defaultUnitLabel: v.optional(v.string()),
    quantityOnHand: v.number(),
    lowStockThreshold: v.optional(v.number()),
    // Per-product opt-in: every stock figure for this product reads as a
    // whole count of the Default unit plus what's left over in Base units
    // ("10 trays, 5 pcs") instead of a plain Base-unit number. See
    // CONTEXT.md's "Remainder reading" and remainderReading.ts — this only
    // changes how a quantity is read, never how it's held. Absent means off.
    remainderReadingEnabled: v.optional(v.boolean()),
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

  suppliers: defineTable({
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
  // their own header table.
  deliveries: defineTable({
    createdAt: v.number(),
    // Optional, same as `sales.customerId` — stock bought retail or received
    // as a gift is still recordable with nobody named. A dangling reference
    // (the supplier gets deleted later) has a legal absent representation, so
    // there is no gate on deleting a supplier tied to a delivery.
    supplierId: v.optional(v.id("suppliers")),
  }),

  pullouts: defineTable({
    createdAt: v.number(),
  }),

  stockMovements: defineTable({
    type: v.union(
      v.literal("sale"),
      v.literal("delivery"),
      v.literal("pullout"),
    ),
    // The header this row belongs to. Required: a product's stock only ever
    // arrives or leaves through a delivery, sale, or pull-out, so every row
    // has an entry behind it that the ledger can open.
    refId: v.union(v.id("sales"), v.id("deliveries"), v.id("pullouts")),
    productId: v.id("products"),
    // The Unit label the movement was entered in — "tray", not "piece" —
    // snapshotted so a Unit removed later cannot orphan the rows that used
    // it. Signed: +delivery, -sale/pullout. `stockMovements.ts` is
    // the only module that writes this table, and the only one that decides
    // the sign — see the notes there.
    unitLabel: v.string(),
    unitQuantity: v.number(),
    // Snapshot of that Unit's Base equivalent at the time of the write. The
    // Base amount is never stored — it is derived on every read as
    // `Math.round(unitQuantity * baseEquivalentAtEntry)`. See
    // docs/adr/0003-base-unit-storage.md.
    baseEquivalentAtEntry: v.number(),
    unitPriceAtSale: v.optional(v.number()), // only when type === "sale"
    reasonCategory: v.optional(v.string()), // only when type === "pullout"
    reasonNotes: v.optional(v.string()), // only when type === "pullout"
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_refId", ["refId"]),
});
