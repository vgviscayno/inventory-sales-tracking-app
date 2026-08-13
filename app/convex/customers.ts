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
    // Every caller that doesn't ask otherwise gets active customers only —
    // the Register's picker, the Customers list's main section. Only the
    // collapsed Archived section asks for `"withArchived"`.
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
    // null clears notes back to unset; omitted leaves the existing value
    // untouched (Convex drops `undefined` args before the mutation runs, so
    // `undefined` can't signal "clear") — same trap and workaround as
    // `products.update`'s `lowStockThreshold`.
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
 * Archive is never gated — the person she most wants off the main list is
 * often the one who owes money, so a debt can never be the reason archiving
 * refuses. Nothing here touches `sales` or `payments`; archiving changes
 * visibility, never the ledger a balance is computed from.
 */
export const archive = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: Date.now() });
  },
});

/**
 * The one-tap reversal — no confirm, same reasoning as `products.unarchive`.
 */
export const unarchive = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: undefined });
  },
});

/**
 * Gated on both halves of the state the client can't be trusted to have
 * checked: archived (she's decided this customer isn't coming back) and
 * settled (the balance is exactly zero). Unlike a product's count, a
 * customer's balance is gated in *either* direction — an overpayment is
 * still money the shop owes back, so it blocks deletion exactly like a debt
 * does. A settled customer with years of sale and payment history still
 * deletes: there is no gate on ledger history anywhere, only on balance. A
 * soft patch rather than `ctx.db.delete`, so every `sales` and `payments`
 * row survives untouched and a deleted customer's name keeps rendering
 * wherever it's already been named.
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
