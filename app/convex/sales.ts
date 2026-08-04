import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { recordMovement, saleTotal } from "./stockMovements";

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

export const create = mutation({
  args: {
    customerId: v.optional(v.id("customers")),
    paymentMethod: v.union(v.literal("cash"), v.literal("utang")),
    items: v.array(
      v.object({ productId: v.id("products"), quantity: v.number() }),
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
        return { item, product };
      }),
    );

    if (!allowNegative) {
      // Summed per product, so two lines of the same product are judged on what
      // the sale actually takes rather than line by line — and so a product on
      // two lines is judged once.
      const remainingPerProduct = new Map<
        Id<"products">,
        { name: string; remaining: number }
      >();
      for (const { item, product } of resolvedItems) {
        const entry = remainingPerProduct.get(item.productId) ?? {
          name: product.name,
          remaining: product.quantityOnHand,
        };
        entry.remaining -= item.quantity;
        remainingPerProduct.set(item.productId, entry);
      }

      for (const { name, remaining } of remainingPerProduct.values()) {
        if (remaining < 0) {
          throw new Error(
            `This sale would leave "${name}" at ${remaining}. ` +
              `Confirm the count is wrong and record it anyway to proceed.`,
          );
        }
      }
    }

    const saleId = await ctx.db.insert("sales", {
      customerId,
      paymentMethod,
      createdAt: Date.now(),
    });

    for (const { item, product } of resolvedItems) {
      await recordMovement(ctx, {
        type: "sale",
        refId: saleId,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceAtSale: product.sellingPrice,
      });
    }

    return saleId;
  },
});
