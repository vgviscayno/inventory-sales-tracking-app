import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findOversold } from "./oversold";
import { entryLines, reasonCategory, recordMovement } from "./stockMovements";

export const create = mutation({
  args: {
    lines: v.array(
      v.object({ productId: v.id("products"), quantity: v.number() }),
    ),
    reasonCategory,
    reasonNotes: v.optional(v.string()),
    // Same backstop as sales.create's allowNegative: the warning is computed
    // client-side, so this flag is the record that a human saw it and said
    // yes. One flag for the whole entry, not one per line.
    allowNegative: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { lines, reasonCategory, reasonNotes, allowNegative },
  ) => {
    if (lines.length === 0) {
      throw new Error("A pull-out must have at least one line");
    }
    for (const line of lines) {
      if (line.quantity <= 0) {
        throw new Error("Each pull-out line must have a positive quantity");
      }
    }
    // A reason that means nothing on its own is never left unexplained.
    if (reasonCategory === "other" && !reasonNotes?.trim()) {
      throw new Error('A note is required when the reason is "other"');
    }

    const resolvedLines = await Promise.all(
      lines.map(async (line) => {
        const product = await ctx.db.get(line.productId);
        if (!product) throw new Error("Product not found");
        return { line, product };
      }),
    );

    if (!allowNegative) {
      // Summed per product, so two lines of the same product are judged on
      // what the pull-out actually takes rather than line by line.
      const oversold = findOversold(
        lines.map((line) => ({
          productId: line.productId,
          delta: -line.quantity,
        })),
        resolvedLines.map(({ line, product }) => ({
          productId: line.productId,
          quantityOnHand: product.quantityOnHand,
        })),
      );
      for (const { productId, projected } of oversold) {
        const name = resolvedLines.find(
          ({ line }) => line.productId === productId,
        )?.product.name;
        throw new Error(
          `This pull-out would leave "${name}" at ${projected}. ` +
            `Confirm the count is wrong and record it anyway to proceed.`,
        );
      }
    }

    const pulloutId = await ctx.db.insert("pullouts", {
      createdAt: Date.now(),
    });

    for (const { line } of resolvedLines) {
      await recordMovement(ctx, {
        type: "pullout",
        refId: pulloutId,
        productId: line.productId,
        quantity: line.quantity,
        reasonCategory,
        reasonNotes,
      });
    }

    return pulloutId;
  },
});

/**
 * Pull-outs newest first, each with its lines joined to the product name at
 * the time of reading and the net change the whole entry carried — the shape
 * the Movements tab renders one row per pull-out from. The reason lives once
 * per entry: every line of a pull-out shares the reason picked for it.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const pullouts = await ctx.db.query("pullouts").order("desc").collect();

    return await Promise.all(
      pullouts.map(async (pullout) => {
        const lines = await entryLines(ctx, pullout._id);
        const firstMovement = await ctx.db
          .query("stockMovements")
          .withIndex("by_refId", (q) => q.eq("refId", pullout._id))
          .first();

        return {
          _id: pullout._id,
          createdAt: pullout.createdAt,
          reasonCategory: firstMovement?.reasonCategory ?? "other",
          reasonNotes: firstMovement?.reasonNotes,
          lines,
          netChange: lines.reduce((sum, l) => sum + l.quantity, 0),
        };
      }),
    );
  },
});
