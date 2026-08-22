import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findNegativeProjections } from "./negativeProjections";
import { findUnit, resolveDefaultUnitLabel } from "./products";
import { entryLines, reasonCategory, recordMovement } from "./stockMovements";

export const create = mutation({
  args: {
    lines: v.array(
      v.object({
        productId: v.id("products"),
        // The Unit this Line's quantity is entered in. An omitted value falls
        // back to the product's Default unit, the same as `deliveries.create`.
        // A tray dropped is one tray damaged, and not thirty pieces.
        unitLabel: v.optional(v.string()),
        quantity: v.number(),
      }),
    ),
    reasonCategory,
    reasonNotes: v.optional(v.string()),
    // The same backstop as `allowNegative` in `sales.create`. The client
    // computes the Negative projection warning, so this flag is the record that
    // a person saw it and agreed. One flag covers the whole Entry, and not one
    // Line.
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
    // The reason "other" says nothing on its own, so a note explains it.
    if (reasonCategory === "other" && !reasonNotes?.trim()) {
      throw new Error('A note is required when the reason is "other"');
    }

    const resolvedLines = await Promise.all(
      lines.map(async (line) => {
        const product = await ctx.db.get(line.productId);
        if (!product) throw new Error("Product not found");
        const unitLabel = line.unitLabel ?? resolveDefaultUnitLabel(product);
        const unit = findUnit(product, unitLabel);
        const baseAmount = Math.round(line.quantity * unit.baseEquivalent);
        return { line, product, unitLabel, baseAmount };
      }),
    );

    if (!allowNegative) {
      // The check sums per product, so two Lines of one product give one
      // judgement. The two Lines may name different Units. The judgement is on
      // what the Pull-out takes, and not on each Line alone.
      const negativeProjections = findNegativeProjections(
        resolvedLines.map(({ line, baseAmount }) => ({
          productId: line.productId,
          delta: -baseAmount,
        })),
        resolvedLines.map(({ line, product }) => ({
          productId: line.productId,
          quantityOnHand: product.quantityOnHand,
        })),
      );
      for (const { productId, projected } of negativeProjections) {
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

    for (const { line, unitLabel } of resolvedLines) {
      await recordMovement(ctx, {
        type: "pullout",
        refId: pulloutId,
        productId: line.productId,
        unitLabel,
        unitQuantity: line.quantity,
        reasonCategory,
        reasonNotes,
      });
    }

    return pulloutId;
  },
});

/**
 * Pull-outs newest first. Each Pull-out carries its Lines and the net change
 * the whole Entry carried. Each Line joins to the product name at the moment of
 * the read. The Movements tab renders one row per Pull-out from this shape.
 * Every Movement of one Pull-out carries the same reason. This query therefore
 * reads the reason from the first row.
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
          netChange: lines.reduce((sum, l) => sum + l.baseAmount, 0),
        };
      }),
    );
  },
});
