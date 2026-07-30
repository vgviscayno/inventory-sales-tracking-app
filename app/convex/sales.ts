import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listForCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, { customerId }) => {
    const sales = await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .order("desc")
      .collect();

    return await Promise.all(
      sales.map(async (sale) => {
        const items = await ctx.db
          .query("saleItems")
          .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
          .collect();
        const totalAmount = items.reduce(
          (sum, i) => sum + i.quantity * i.unitPriceAtSale,
          0,
        );
        return { ...sale, items, totalAmount };
      }),
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
  },
  handler: async (ctx, { customerId, paymentMethod, items }) => {
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
        if (item.quantity > product.quantityOnHand) {
          throw new Error(
            `Not enough stock of "${product.name}" to complete this sale`,
          );
        }
        return { item, product };
      }),
    );

    const saleId = await ctx.db.insert("sales", {
      customerId,
      paymentMethod,
      createdAt: Date.now(),
    });

    for (const { item, product } of resolvedItems) {
      await ctx.db.patch(item.productId, {
        quantityOnHand: product.quantityOnHand - item.quantity,
      });

      await ctx.db.insert("saleItems", {
        saleId,
        productId: item.productId,
        quantity: item.quantity,
        unitPriceAtSale: product.sellingPrice,
      });
    }

    return saleId;
  },
});
