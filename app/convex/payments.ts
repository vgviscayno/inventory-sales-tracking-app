/**
 * A Payment is money a customer hands over against a balance. It names the
 * customer and never a Sale. `computeBalance` in `customers.ts` nets the
 * Payments against the total of that customer's Utang sales. No Payment
 * therefore pays off, settles, or closes a Sale. See "Payment" in CONTEXT.md.
 * `remove` calls `ctx.db.delete`. A Payment carries no lifecycle timestamp,
 * unlike a product or a customer. A deleted Payment therefore raises the
 * customer's balance at the next read, and leaves no record of itself.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const listForCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, { customerId }) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    customerId: v.id("customers"),
    amount: v.number(),
    paidAt: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("payments", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("payments"),
    amount: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => {
    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: { id: v.id("payments") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
