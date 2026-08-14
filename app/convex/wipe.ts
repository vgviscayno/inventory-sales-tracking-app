import { internalMutation } from "./_generated/server";

/**
 * A one-off, run by hand against a deployment before this ticket's schema
 * lands:
 *
 *     npx convex run wipe:forUnits
 *
 * INV-42 changes what a `products` row and a `stockMovements` row mean —
 * `sellingPrice` becomes a required `units` list, `quantity` becomes a
 * required Unit/ratio pair — in a way existing rows cannot be reinterpreted
 * into. A migration would mean writing a `units` list for every product by
 * hand with no source of truth for what it should say. This deployment holds
 * test data only, so a wipe is cheaper and cleaner than a migration wearing
 * a migration's costume — see the ticket's own note on this.
 *
 * `customers` and `appSettings` are untouched: neither's shape changes, and
 * there is no reason to lose a shop's customer list over a stock-model
 * change.
 */
export const forUnits = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tables = [
      "products",
      "stockMovements",
      "sales",
      "deliveries",
      "pullouts",
      "payments",
    ] as const;

    const deletedCounts: Record<string, number> = {};
    for (const table of tables) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
      deletedCounts[table] = rows.length;
    }
    return deletedCounts;
  },
});
