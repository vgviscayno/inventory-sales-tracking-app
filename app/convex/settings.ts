import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
