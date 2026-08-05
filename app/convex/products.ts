import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const DEFAULT_THRESHOLD = 10;

function withStatus<
  T extends { quantityOnHand: number; lowStockThreshold?: number },
>(product: T, globalThreshold: number) {
  const threshold = product.lowStockThreshold ?? globalThreshold;
  // Negative first, and it has to stay first: a negative count is also
  // `<= threshold`, so the low case would swallow it and render "order more"
  // over what is really "this count is wrong, recount".
  const lowStockStatus =
    product.quantityOnHand < 0
      ? ("negative" as const)
      : product.quantityOnHand <= threshold
        ? ("low" as const)
        : ("ok" as const);
  return { ...product, lowStockStatus };
}

export const list = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, { search }) => {
    const settings = await ctx.db.query("appSettings").first();
    const globalThreshold = settings?.lowStockThreshold ?? DEFAULT_THRESHOLD;

    const all = await ctx.db.query("products").collect();
    const filtered = search
      ? all.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
      : all;

    return filtered
      .map((p) => withStatus(p, globalThreshold))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    const product = await ctx.db.get(id);
    if (!product) return null;
    const settings = await ctx.db.query("appSettings").first();
    return withStatus(
      product,
      settings?.lowStockThreshold ?? DEFAULT_THRESHOLD,
    );
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    sellingPrice: v.number(),
    quantityOnHand: v.number(),
    lowStockThreshold: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("products", args);
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    sellingPrice: v.optional(v.number()),
    quantityOnHand: v.optional(v.number()),
    // null clears the per-product override back to the global default;
    // omitted leaves the existing value untouched (Convex drops `undefined`
    // args before the mutation runs, so `undefined` can't signal "clear").
    lowStockThreshold: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { id, lowStockThreshold, ...patch }) => {
    await ctx.db.patch(id, {
      ...patch,
      ...(lowStockThreshold !== undefined
        ? { lowStockThreshold: lowStockThreshold ?? undefined }
        : {}),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
