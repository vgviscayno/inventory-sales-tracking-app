import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { resolveDefaultUnitLabel } from "./products";
import { entryLines, recordMovement } from "./stockMovements";

export const create = mutation({
  args: {
    // A Line either names a product that already exists, or carries what a new
    // product needs. The `kind` literal makes that a type the handler switches
    // on. Without it the args would carry a `productId` beside a new-product
    // object. The handler would then reject the both-or-neither states by hand.
    lines: v.array(
      v.union(
        v.object({
          kind: v.literal("existing"),
          productId: v.id("products"),
          // The Unit this Line's quantity is entered in. An omitted value
          // falls back to the product's Default unit. See
          // `resolveDefaultUnitLabel`.
          // A caller that does not care about Units therefore still lands on
          // the Base unit. A single-Unit product always defaults to it. Most
          // existing tests and the "new" Line's own creation path are such
          // callers.
          unitLabel: v.optional(v.string()),
          quantity: v.number(),
        }),
        v.object({
          kind: v.literal("new"),
          name: v.string(),
          // The single Unit this quick-created product starts with, which is
          // its Base unit. Nothing offers a default here either. A plausible
          // default is how a product ends up based in the wrong Unit. See
          // docs/adr/0004-base-unit-locked.md.
          unitLabel: v.string(),
          price: v.number(),
          quantity: v.number(),
        }),
      ),
    ),
    // Optional. The shop still records stock it bought retail or received as a
    // gift. It also records stock from somebody it does not name.
    supplierId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, { lines, supplierId }) => {
    if (lines.length === 0) {
      throw new Error("A delivery must have at least one line");
    }
    for (const line of lines) {
      if (line.quantity <= 0) {
        throw new Error("Each delivery line must have a positive quantity");
      }
      if (line.kind === "new") {
        if (!line.unitLabel.trim()) {
          throw new Error("A new product needs a Unit label");
        }
        if (line.price <= 0) {
          throw new Error("A new product needs a positive price");
        }
      }
    }

    const deliveryId = await ctx.db.insert("deliveries", {
      createdAt: Date.now(),
      supplierId,
    });

    // One `recordMovement` call per Line, even when two Lines name the same
    // product. Each Line is its own arrival on its own row. The handler never
    // merges two Unit quantities before they reach the Ledger.
    // The handler creates a Line's product here, inside the same mutation as
    // the Delivery it arrived on. The two therefore land together, or on any
    // failure neither lands.
    for (const line of lines) {
      let productId: Id<"products">;
      let unitLabel: string;
      if (line.kind === "existing") {
        productId = line.productId;
        const product = await ctx.db.get(productId);
        if (!product) throw new Error("Product not found");
        unitLabel = line.unitLabel ?? resolveDefaultUnitLabel(product);
      } else {
        unitLabel = line.unitLabel;
        productId = await ctx.db.insert("products", {
          name: line.name,
          units: [{ label: unitLabel, baseEquivalent: 1, price: line.price }],
          baseUnitLabel: unitLabel,
          quantityOnHand: 0,
        });
      }
      await recordMovement(ctx, {
        type: "delivery",
        refId: deliveryId,
        productId,
        unitLabel,
        unitQuantity: line.quantity,
      });
    }

    return deliveryId;
  },
});

/**
 * Deliveries newest first. Each Delivery carries its Lines and the net change
 * the whole Entry carried. Each Line joins to the product name at the moment of
 * the read. The Movements tab renders one row per Delivery from this shape.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const deliveries = await ctx.db.query("deliveries").order("desc").collect();

    return await Promise.all(
      deliveries.map(async (delivery) => {
        const lines = await entryLines(ctx, delivery._id);
        return {
          _id: delivery._id,
          createdAt: delivery.createdAt,
          lines,
          netChange: lines.reduce((sum, l) => sum + l.baseAmount, 0),
        };
      }),
    );
  },
});
