import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

async function computeBalance(ctx: any, customerId: string) {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_customer", (q: any) => q.eq("customerId", customerId))
    .filter((q: any) => q.eq(q.field("paymentMethod"), "utang"))
    .collect();

  let totalCharged = 0;
  for (const sale of sales) {
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q: any) => q.eq("saleId", sale._id))
      .collect();
    totalCharged += items.reduce((sum: number, item: any) => sum + item.quantity * item.unitPriceAtSale, 0);
  }

  const payments = await ctx.db
    .query("payments")
    .withIndex("by_customer", (q: any) => q.eq("customerId", customerId))
    .collect();
  const totalPaid = payments.reduce((sum: number, p: any) => sum + p.amount, 0);

  return totalCharged - totalPaid;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const customers = await ctx.db.query("customers").collect();
    return await Promise.all(
      customers.map(async (c) => ({
        ...c,
        balance: await computeBalance(ctx, c._id),
      }))
    );
  },
});

export const get = query({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    const customer = await ctx.db.get(id);
    if (!customer) return null;
    return { ...customer, balance: await computeBalance(ctx, id) };
  },
});

export const create = mutation({
  args: { name: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db.insert("customers", args);
  },
});

export const update = mutation({
  args: { id: v.id("customers"), name: v.optional(v.string()), notes: v.optional(v.string()) },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});
