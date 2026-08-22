import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { filterLifecycle } from "./lifecycle";

export const list = query({
  args: {
    // A caller that asks for nothing gets active suppliers only. This covers
    // the Delivery sheet's picker and the main section of the Suppliers list.
    // Only the collapsed Archived section asks for `"withArchived"`.
    include: v.optional(
      v.union(v.literal("active"), v.literal("withArchived")),
    ),
  },
  handler: async (ctx, { include }) => {
    const suppliers = await ctx.db.query("suppliers").collect();
    return filterLifecycle(suppliers, include ?? "active");
  },
});

/**
 * No lifecycle filter runs here. This query is the picker's "included by id"
 * half. It must find an archived or a deleted supplier that `list` above
 * hides. An unrelated edit to a Delivery would otherwise blank who supplied it,
 * and nothing on screen would say so.
 */
export const get = query({
  args: { id: v.id("suppliers") },
  handler: async (ctx, { id }) => await ctx.db.get(id),
});

export const create = mutation({
  args: { name: v.string(), notes: v.optional(v.string()) },
  handler: async (ctx, args) => await ctx.db.insert("suppliers", args),
});

export const update = mutation({
  args: {
    id: v.id("suppliers"),
    name: v.optional(v.string()),
    // `null` clears the notes back to unset. An omitted value leaves the
    // stored value untouched. This is the same trap and the same workaround as
    // the notes in `customers.update`.
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
 * Nothing gates Archive. The reasoning is the same as in `customers.archive`.
 * Nothing here touches `deliveries`. Archive changes visibility, and never a
 * Delivery already attached to this supplier.
 */
export const archive = mutation({
  args: { id: v.id("suppliers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: Date.now() });
  },
});

/**
 * The one-tap reversal. There is no confirm. The reasoning is the same as in
 * `customers.unarchive`.
 */
export const unarchive = mutation({
  args: { id: v.id("suppliers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: undefined });
  },
});

/**
 * Delete gates on the archived state alone. There is no balance and no second
 * condition to check, unlike `customers.remove`.
 * A dangling `supplierId` on a Delivery is the only thing this leaves behind.
 * That reference has a legal absent representation.
 * The handler patches a timestamp and does not call `ctx.db.delete`. A deleted
 * supplier therefore still shows its name on every Delivery it is already
 * named on.
 */
export const remove = mutation({
  args: { id: v.id("suppliers") },
  handler: async (ctx, { id }) => {
    const supplier = await ctx.db.get(id);
    if (!supplier) throw new Error("Supplier not found");
    if (supplier.archivedAt === undefined) {
      throw new Error("Only an archived supplier can be deleted");
    }
    await ctx.db.patch(id, { deletedAt: Date.now() });
  },
});
