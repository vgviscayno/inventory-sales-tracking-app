import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findOversold } from "./oversold";
import { findUnit } from "./products";
import { entryLines, recordMovement, saleTotal } from "./stockMovements";

export const listForCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, { customerId }) => {
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .order("desc")
      .collect();

    return await Promise.all(
      sales.map(async (sale) => ({
        ...sale,
        totalAmount: await saleTotal(ctx, sale._id),
      })),
    );
  },
});

/**
 * Sales newest first, each with its lines joined to the product name at the
 * time of reading, the net change the whole entry carried, and the
 * customer's name when the sale named one — the shape the Movements tab
 * renders one row per sale from, once sales are opted into that view.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const sales = await ctx.db.query("sales").order("desc").collect();

    return await Promise.all(
      sales.map(async (sale) => {
        const lines = await entryLines(ctx, sale._id);
        const customer = sale.customerId
          ? await ctx.db.get(sale.customerId)
          : null;

        return {
          _id: sale._id,
          createdAt: sale.createdAt,
          paymentMethod: sale.paymentMethod,
          customerName: customer?.name,
          lines,
          netChange: lines.reduce((sum, l) => sum + l.baseAmount, 0),
          totalAmount: await saleTotal(ctx, sale._id),
        };
      }),
    );
  },
});

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    paymentMethod: v.union(v.literal("cash"), v.literal("utang")),
    items: v.array(
      v.object({
        productId: v.id("products"),
        unitLabel: v.string(),
        quantity: v.number(),
      }),
    ),
    // One flag for the whole sale, not one per line: it records the fact that a
    // human was warned and said yes, and there is one such gesture per save.
    // The warning itself has to be computed client-side — a mutation cannot ask
    // mid-flight — so this is the backstop that stops a script, or a surface
    // that forgot to warn, from driving stock negative with nobody looking.
    allowNegative: v.optional(v.boolean()),
  },
  handler: async (ctx, { customerId, paymentMethod, items, allowNegative }) => {
    if (paymentMethod === "utang" && !customerId) {
      throw new Error("Utang sales require a customer");
    }
    if (items.length === 0) {
      throw new Error("A sale must have at least one item");
    }

    const resolvedItems = await Promise.all(
      items.map(async (item) => {
        const product = await ctx.db.get(item.productId);
        if (!product) throw new Error("Product not found");
        return { item, product, unit: findUnit(product, item.unitLabel) };
      }),
    );

    if (!allowNegative) {
      // Summed per product in Base units, so two lines of the same product —
      // in the same Unit or different ones — are judged on what the sale
      // actually takes off the shelf, not line by line and not in whichever
      // Unit each line happened to be rung up in.
      const oversold = findOversold(
        resolvedItems.map(({ item, unit }) => ({
          productId: item.productId,
          delta: -Math.round(item.quantity * unit.baseEquivalent),
        })),
        resolvedItems.map(({ item, product }) => ({
          productId: item.productId,
          quantityOnHand: product.quantityOnHand,
        })),
      );
      for (const { productId, projected } of oversold) {
        const name = resolvedItems.find(
          ({ item }) => item.productId === productId,
        )?.product.name;
        throw new Error(
          `This sale would leave "${name}" at ${projected}. ` +
            `Confirm the count is wrong and record it anyway to proceed.`,
        );
      }
    }

    const saleId = await ctx.db.insert("sales", {
      customerId,
      paymentMethod,
      createdAt: Date.now(),
    });

    for (const { item, unit } of resolvedItems) {
      await recordMovement(ctx, {
        type: "sale",
        refId: saleId,
        productId: item.productId,
        unitLabel: item.unitLabel,
        unitQuantity: item.quantity,
        unitPriceAtSale: unit.price,
      });
    }

    return saleId;
  },
});
