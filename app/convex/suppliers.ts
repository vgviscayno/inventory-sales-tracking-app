import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { filterLifecycle } from "./lifecycle";

export const list = query({
  args: {
    // Every caller that doesn't ask otherwise gets active suppliers only —
    // the delivery sheet's picker and the Suppliers list's main section.
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
 * Unfiltered by lifecycle — the picker's "included by id" half, which has to
 * find an archived or deleted supplier `list` above would hide, so an
 * unrelated edit to a delivery never silently blanks who supplied it.
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
    // null clears notes back to unset; omitted leaves the existing value
    // untouched — same trap and workaround as `customers.update`'s notes.
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
 * Archive is never gated, same reasoning as `customers.archive`. Nothing
 * here touches `deliveries`; archiving changes visibility, never a delivery
 * already attached to this supplier.
 */
export const archive = mutation({
  args: { id: v.id("suppliers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: Date.now() });
  },
});

/**
 * The one-tap reversal — no confirm, same reasoning as `customers.unarchive`.
 */
export const unarchive = mutation({
  args: { id: v.id("suppliers") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: undefined });
  },
});

/**
 * Gated on archived-first only — unlike `customers.remove`, there is no
 * balance or other second condition to check, so a dangling `supplierId` on
 * a delivery is the only thing this leaves behind, and that reference has a
 * legal absent representation. A soft patch rather than `ctx.db.delete`, so
 * a deleted supplier's name keeps rendering on every delivery it's already
 * named.
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
