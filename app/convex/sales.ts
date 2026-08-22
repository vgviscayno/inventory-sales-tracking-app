import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { findNegativeProjections } from "./negativeProjections";
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
 * Sales newest first. Each Sale carries its Lines and the net change the whole
 * Entry carried. It also carries the customer's name when the Sale names one.
 * Each Line joins to the product name at the moment of the read.
 * The Movements tab renders one row per Sale from this shape, once somebody
 * opts Sales into that view.
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
    // One flag covers the whole Sale, and not one Line. It records that a
    // person saw the warning and agreed, and there is one such gesture per
    // save.
    // The client computes the Oversold warning, because a mutation cannot ask
    // mid-flight. This flag is therefore the backstop. It stops a
    // script, or a surface that forgot to warn, from driving stock negative
    // with nobody looking.
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
      // The check sums per product in Base units, so two Lines of one product
      // give one judgement. The two Lines may name the same Unit or different
      // Units. The judgement is on what the Sale takes off the shelf. It is not
      // per Line, and not in whichever Unit each Line was rung up in.
      const oversold = findNegativeProjections(
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
