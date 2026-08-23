import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, type QueryCtx, query } from "./_generated/server";
import { filterLifecycle } from "./lifecycle";
import { saleTotal } from "./stockMovements";

async function computeBalance(ctx: QueryCtx, customerId: Id<"customers">) {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .filter((q) => q.eq(q.field("paymentMethod"), "utang"))
    .collect();

  let totalCharged = 0;
  for (const sale of sales) {
    totalCharged += await saleTotal(ctx, sale._id);
  }

  const payments = await ctx.db
    .query("payments")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return totalCharged - totalPaid;
}

export const list = query({
  args: {
    // A caller that asks for nothing gets active customers only. This covers
    // the Register's picker and the main section of the Customers list. Only
    // the collapsed Archived section asks for `"withArchived"`.
    include: v.optional(
      v.union(v.literal("active"), v.literal("withArchived")),
    ),
  },
  handler: async (ctx, { include }) => {
    const customers = await ctx.db.query("customers").collect();
    const filtered = filterLifecycle(customers, include ?? "active");
    return await Promise.all(
      filtered.map(async (c) => ({
        ...c,
        balance: await computeBalance(ctx, c._id),
      })),
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
  args: {
    id: v.id("customers"),
    name: v.optional(v.string()),
    // `null` clears the notes back to unset. An omitted value leaves the
    // stored value untouched. Convex drops an `undefined` arg before the
    // mutation runs, so `undefined` cannot mean "clear". This is the same trap
    // and the same workaround as `lowStockThresholdInDefaultUnits` in
    // `products.update`.
    notes: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { id, notes, ...patch }) => {
    await ctx.db.patch(id, {
      ...patch,
      ...(notes !== undefined ? { notes: notes ?? undefined } : {}),
    });
  },
});

/**
 * Nothing gates Archive. The customer the shop most wants off the main list is
 * often the one who owes money. A debt is therefore never a reason for Archive
 * to refuse.
 * Nothing here touches `sales` or `payments`. Archive changes visibility, and
 * never the Account history a balance comes from.
 */
export const archive = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: Date.now() });
  },
});

/**
 * The one-tap reversal. There is no confirm. The reasoning is the same as in
 * `products.unarchive`.
 */
export const unarchive = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: undefined });
  },
});

/**
 * Delete gates on two halves of the state that the client cannot be trusted to
 * have checked. The customer is archived, which is the decision that this
 * customer is not coming back. The customer is settled, which is a balance of
 * exactly zero.
 * A balance gates in either direction, unlike a product's count. An overpayment
 * is money the shop owes back, so it blocks the delete exactly as a debt does.
 * A settled customer with years of Account history still deletes. Nothing
 * gates on the history anywhere. The gate is on the balance alone.
 * The handler patches a timestamp and does not call `ctx.db.delete`. Every
 * `sales` and `payments` row therefore survives untouched. A deleted customer
 * still shows its name wherever it is already named.
 */
export const remove = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    const customer = await ctx.db.get(id);
    if (!customer) throw new Error("Customer not found");
    if (customer.archivedAt === undefined) {
      throw new Error("Only an archived customer can be deleted");
    }
    const balance = await computeBalance(ctx, id);
    if (balance !== 0) {
      throw new Error(
        balance > 0
          ? `${customer.name} owes ₱${balance.toFixed(2)} — settle first`
          : `${customer.name} is owed ₱${(-balance).toFixed(2)} — settle first`,
      );
    }
    await ctx.db.patch(id, { deletedAt: Date.now() });
  },
});
