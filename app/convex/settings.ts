import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * The one shop-wide setting. `appSettings` holds a single row, and
 * `setLowStockThreshold` inserts it on the first call.
 * `get` returns a literal when no row exists yet, so it never returns nothing.
 * That literal carries no `_id`, unlike a real row.
 * No caller reads this module today. `products.ts` declares the same default
 * number again, and its queries read the `appSettings` row directly.
 */
const DEFAULT_THRESHOLD = 10;

export const get = query({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("appSettings").first();
    return existing ?? { lowStockThreshold: DEFAULT_THRESHOLD };
  },
});

export const setLowStockThreshold = mutation({
  args: { lowStockThreshold: v.number() },
  handler: async (ctx, { lowStockThreshold }) => {
    const existing = await ctx.db.query("appSettings").first();
    if (existing) {
      await ctx.db.patch(existing._id, { lowStockThreshold });
    } else {
      await ctx.db.insert("appSettings", { lowStockThreshold });
    }
  },
});
