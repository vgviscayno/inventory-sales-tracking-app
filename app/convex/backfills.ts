import { internalMutation } from "./_generated/server";
import { recordOpeningBalance } from "./stockMovements";

/**
 * One-off backfills, run by hand against a deployment:
 *
 *     npx convex run backfills:openingBalances
 *
 * Deliberately not the migrations component. These run once per deployment
 * under someone's eye, over a products table in the low hundreds of rows — a
 * scheduled, batched, resumable runner would be machinery around a single
 * `collect()`.
 */

/**
 * Give the ledger a beginning. Every product gets one `opening` row holding
 * whatever it had on hand at the moment this ran, so its cached count is a
 * stated starting point with rows that sum to it, rather than a number that
 * appeared from nowhere.
 *
 * Idempotent per product, because a hand-run mutation firing twice is a
 * plausible slip and a second opening row would silently double the ledger.
 *
 * Every product, with no lifecycle predicate — once archived and soft-deleted
 * products exist they need their opening rows too, the deleted ones most of
 * all, since there is no UI left to repair them by hand.
 */
export const openingBalances = internalMutation({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db.query("products").collect();

    let openingRowsWritten = 0;
    for (const product of products) {
      if (await recordOpeningBalance(ctx, product)) openingRowsWritten++;
    }

    return { productsScanned: products.length, openingRowsWritten };
  },
});
