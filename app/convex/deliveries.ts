import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { entryLines, recordMovement } from "./stockMovements";

export const create = mutation({
  args: {
    // A line either names a product that already exists, or carries what's
    // needed to create one — the `kind` literal makes that a type the
    // handler can switch on instead of a productId/newProduct pair whose
    // both-or-neither states have to be rejected by hand.
    lines: v.array(
      v.union(
        v.object({
          kind: v.literal("existing"),
          productId: v.id("products"),
          quantity: v.number(),
        }),
        v.object({
          kind: v.literal("new"),
          name: v.string(),
          // The single Unit this quick-created product starts with — its
          // Base unit. No default is offered here either (see
          // docs/adr/0004-base-unit-locked.md): a plausible-looking one is
          // how a product ends up based in the wrong Unit.
          unitLabel: v.string(),
          price: v.number(),
          quantity: v.number(),
        }),
      ),
    ),
    // Optional — stock bought retail, received as a gift, or from someone
    // she doesn't need to name is still recordable.
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

    // One `recordMovement` call per line, even when two lines name the same
    // product — each is its own arrival on its own row, not a quantity to
    // merge before it reaches the ledger. A line's product is created here,
    // inside the same mutation as the delivery it arrived on, so the two
    // either land together or (on any failure) neither does.
    for (const line of lines) {
      let productId: Id<"products">;
      let unitLabel: string;
      if (line.kind === "existing") {
        productId = line.productId;
        const product = await ctx.db.get(productId);
        if (!product) throw new Error("Product not found");
        unitLabel = product.baseUnitLabel;
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
 * Deliveries newest first, each with its lines joined to the product name at
 * the time of reading and the net change the whole entry carried — the shape
 * the Movements tab renders one row per delivery from.
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
