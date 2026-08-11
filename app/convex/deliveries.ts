import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { recordMovement } from "./stockMovements";

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
          sellingPrice: v.number(),
          quantity: v.number(),
        }),
      ),
    ),
  },
  handler: async (ctx, { lines }) => {
    if (lines.length === 0) {
      throw new Error("A delivery must have at least one line");
    }
    for (const line of lines) {
      if (line.quantity <= 0) {
        throw new Error("Each delivery line must have a positive quantity");
      }
      if (line.kind === "new" && line.sellingPrice <= 0) {
        throw new Error("A new product needs a positive selling price");
      }
    }

    const deliveryId = await ctx.db.insert("deliveries", {
      createdAt: Date.now(),
    });

    // One `recordMovement` call per line, even when two lines name the same
    // product — each is its own arrival on its own row, not a quantity to
    // merge before it reaches the ledger. A line's product is created here,
    // inside the same mutation as the delivery it arrived on, so the two
    // either land together or (on any failure) neither does.
    for (const line of lines) {
      const productId =
        line.kind === "existing"
          ? line.productId
          : await ctx.db.insert("products", {
              name: line.name,
              sellingPrice: line.sellingPrice,
              quantityOnHand: 0,
            });
      await recordMovement(ctx, {
        type: "delivery",
        refId: deliveryId,
        productId,
        quantity: line.quantity,
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
        const movements = await ctx.db
          .query("stockMovements")
          .withIndex("by_refId", (q) => q.eq("refId", delivery._id))
          .collect();

        const lines = await Promise.all(
          movements.map(async (m) => {
            const product = await ctx.db.get(m.productId);
            return {
              productId: m.productId,
              productName: product?.name ?? "Deleted product",
              quantity: m.quantity,
            };
          }),
        );

        return {
          _id: delivery._id,
          createdAt: delivery.createdAt,
          lines,
          netChange: lines.reduce((sum, l) => sum + l.quantity, 0),
        };
      }),
    );
  },
});
