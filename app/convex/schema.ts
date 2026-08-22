import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// One Unit a product is counted and transacted in, such as a piece, a tray, or
// a kilo.
// The schema and the args validators in `products.ts` share this object. A new
// field on a Unit therefore needs one declaration.
export const unitValidator = v.object({
  label: v.string(),
  baseEquivalent: v.number(),
  price: v.number(),
});

export default defineSchema({
  products: defineTable({
    name: v.string(),
    // Every product has at least one Unit. `baseEquivalent` gives how many
    // Base units one of this Unit amounts to. It is 1 for the Base unit and 30
    // for an egg tray. See docs/adr/0003-base-unit-storage.md.
    units: v.array(unitValidator),
    // Which `units[].label` names this product's Base unit. The product records
    // the choice. No reader infers it from a `baseEquivalent` of 1.
    // The choice locks once the product has Movements. See
    // docs/adr/0004-base-unit-locked.md.
    baseUnitLabel: v.string(),
    // Which `units[].label` this product leads with. A listing quotes the price
    // in this Unit, and a form preselects it.
    // The Default unit is a separate decision from the Base unit. See
    // "Default unit" in CONTEXT.md. This choice never locks.
    // An absent value means the product records no choice. Every reader falls
    // back to the Base unit. Absence is not a case of its own.
    defaultUnitLabel: v.optional(v.string()),
    quantityOnHand: v.number(),
    lowStockThreshold: v.optional(v.number()),
    // The Reading ladder. It names which of this product's Units the stock
    // reads in. The stock then reads "3 cases, 5 pcs" instead of "1085 pcs".
    // The field holds labels and not an ordered list of Units. The reading
    // trusts neither the order nor the membership here. It sorts by descending
    // Base equivalent, and it appends the Base unit itself.
    // An absent or empty value means the plain Base-unit reading.
    // The product's own Unit count bounds this array. It is therefore not one
    // of the unbounded arrays the Convex guidelines warn against.
    // See "Reading ladder" in CONTEXT.md, and see remainderReading.ts. This
    // field changes how a quantity reads. It never changes how the app holds
    // one.
    denominationLabels: v.optional(v.array(v.string())),
    // A uniform two-state lifecycle. An absent timestamp means active.
    // There is no index. Every handler collects the whole table and filters in
    // JS, and about 100 products make an index noise. See lifecycle.ts.
    archivedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  }),

  customers: defineTable({
    name: v.string(),
    notes: v.optional(v.string()),
    // A uniform two-state lifecycle, absent meaning active. See lifecycle.ts.
    archivedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  }),

  suppliers: defineTable({
    name: v.string(),
    notes: v.optional(v.string()),
    // A uniform two-state lifecycle, absent meaning active. See lifecycle.ts.
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

  // A Delivery header or a Pull-out header groups the Movements that a person
  // logs together. A shipment of five products therefore reads as one Entry. A
  // Sale has a header table of its own.
  deliveries: defineTable({
    createdAt: v.number(),
    // Optional, like `sales.customerId`. The shop still records stock that it
    // bought retail or received as a gift, with nobody named.
    // A dangling reference has a legal absent representation. Nothing therefore
    // gates the delete of a supplier that a Delivery names.
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
    // The header this Movement belongs to. It is required. Stock only arrives
    // or leaves through a Delivery, a Sale, or a Pull-out. The Ledger can
    // therefore always open the Entry behind a row.
    refId: v.union(v.id("sales"), v.id("deliveries"), v.id("pullouts")),
    productId: v.id("products"),
    // The Unit label the Movement was entered in, such as "tray" and not
    // "piece". The write snapshots the label, so a Unit that somebody removes
    // later cannot orphan the rows that used it.
    unitLabel: v.string(),
    // Signed: a Delivery is positive, a Sale and a Pull-out are negative.
    // `stockMovements.ts` is the only module that writes this table, and the
    // only one that decides the sign. See the notes there.
    unitQuantity: v.number(),
    // The Unit's Base equivalent at the moment of the write. An edit to the
    // product's Units therefore leaves this Movement's Base amount unchanged.
    // See docs/adr/0003-base-unit-storage.md.
    baseEquivalentAtEntry: v.number(),
    unitPriceAtSale: v.optional(v.number()), // only when type === "sale"
    reasonCategory: v.optional(v.string()), // only when type === "pullout"
    reasonNotes: v.optional(v.string()), // only when type === "pullout"
    createdAt: v.number(),
  })
    .index("by_product", ["productId"])
    .index("by_refId", ["refId"]),
});
