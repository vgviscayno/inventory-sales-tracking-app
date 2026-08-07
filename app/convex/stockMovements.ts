import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, query } from "./_generated/server";

/**
 * The sign each movement type carries. A `stockMovements` row stores `quantity`
 * as a signed delta so every cache update is a plain add with no per-type
 * branching — but that sign is redundant with the `type` sitting beside it, and
 * a schema comment is not what stops a positive pull-out. This table is. It is
 * the only place in the codebase that knows which way a type moves stock.
 *
 * `opening` is absent because it is not a movement: it states a count that
 * already exists rather than changing one, so it carries its own sign and goes
 * through `recordOpeningBalance` below.
 */
const DIRECTION = {
  delivery: 1,
  sale: -1,
  pullout: -1,
} as const;

/**
 * The per-type fields, each fixed to the one type that may carry it — so a
 * pull-out reason on a sale, or a sale price on a delivery, is a type error
 * rather than a row nobody notices.
 */
type MovementDetails =
  | { type: "delivery"; refId: Id<"deliveries"> }
  | { type: "sale"; refId: Id<"sales">; unitPriceAtSale: number }
  | {
      type: "pullout";
      refId: Id<"pullouts">;
      reasonCategory: string;
      reasonNotes?: string;
    };

type Movement = MovementDetails & {
  productId: Id<"products">;
  /** How many units moved — a magnitude, never signed. */
  quantity: number;
};

/**
 * Write one movement and move the product's cached count with it. The two
 * halves are the invariant the whole feature exists to protect, so no caller
 * gets to do one without the other.
 */
export async function recordMovement(ctx: MutationCtx, movement: Movement) {
  if (movement.quantity < 0) {
    throw new Error(
      `A ${movement.type} movement takes a magnitude, not a signed quantity (got ${movement.quantity})`,
    );
  }

  const product = await ctx.db.get(movement.productId);
  if (!product) throw new Error("Product not found");

  const delta = DIRECTION[movement.type] * movement.quantity;

  await ctx.db.insert("stockMovements", {
    ...movement,
    quantity: delta,
    createdAt: Date.now(),
  });
  await ctx.db.patch(movement.productId, {
    quantityOnHand: product.quantityOnHand + delta,
  });
}

/**
 * The one ledger write that does not move stock. An opening row says where a
 * product's count came from, so — unlike `recordMovement` — it leaves
 * `quantityOnHand` untouched: the cache is already the number this row exists
 * to account for, and adding to it would double the product's stock.
 *
 * The quantity is the cache *minus what the ledger already explains*, which is
 * the count the product started with. On the run this was written for the
 * ledger is empty and that is simply `quantityOnHand`. It stops being simply
 * that for a product created after an earlier run and sold from before the
 * next one: opening such a product at today's count would count those sales
 * twice and leave the cache disagreeing with its own rows.
 *
 * The guard is per product rather than "bail if any opening row exists
 * anywhere", so that later-created product still picks its row up.
 *
 * @returns whether a row was written, i.e. false if the product already had one
 */
export async function recordOpeningBalance(
  ctx: MutationCtx,
  product: Doc<"products">,
) {
  const movements = await ctx.db
    .query("stockMovements")
    .withIndex("by_product", (q) => q.eq("productId", product._id))
    .collect();

  if (movements.some((m) => m.type === "opening")) return false;

  const alreadyExplained = movements.reduce((sum, m) => sum + m.quantity, 0);

  // An opening row explains what came before every other row for this
  // product, which is a fact about the ledger's story, not about when the
  // backfill happened to run. Stamping it with `Date.now()` would place it
  // after any movement recorded before the backfill ran — the ledger's oldest
  // row landing last in a chronological read. Backdating it to just before
  // the earliest existing movement (or now, if there are none) keeps it first
  // regardless of when this actually runs.
  const earliestExisting = movements.reduce(
    (min, m) => Math.min(min, m.createdAt),
    Date.now(),
  );

  await ctx.db.insert("stockMovements", {
    type: "opening",
    productId: product._id,
    quantity: product.quantityOnHand - alreadyExplained,
    createdAt: movements.length > 0 ? earliestExisting - 1 : earliestExisting,
  });
  return true;
}

/**
 * What a sale charged, derived from its ledger rows rather than stored. Sale
 * quantities are negative, so the line amounts are subtracted to land back on a
 * positive total.
 */
export async function saleTotal(ctx: QueryCtx, saleId: Id<"sales">) {
  const movements = await ctx.db
    .query("stockMovements")
    .withIndex("by_refId", (q) => q.eq("refId", saleId))
    .filter((q) => q.eq(q.field("type"), "sale"))
    .collect();

  return movements.reduce((total, m) => {
    if (m.unitPriceAtSale === undefined) {
      throw new Error(`Sale movement ${m._id} has no unitPriceAtSale`);
    }
    return total - m.quantity * m.unitPriceAtSale;
  }, 0);
}

/**
 * The per-product ledger the product detail page reads: every movement that
 * ever changed — or, for `opening`, stated — this product's count, newest
 * first, each carrying the running balance immediately after it. That
 * balance is why this is computed oldest-first internally and reversed for
 * return rather than walked backwards from `quantityOnHand`: a backwards walk
 * would silently agree with a cache that had drifted from its own ledger,
 * while this one derives the balance from the rows alone, the same source
 * `expectCacheMatchesLedger` checks the cache against.
 *
 * `netChange` names the signed quantity — matching the field the Movements
 * tab's day-grouped list already keys its headings on — so this ledger reuses
 * that same list component rather than a second copy of it.
 */
export const listForProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    const movements = await ctx.db
      .query("stockMovements")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .collect();

    // `by_product` doesn't order by `createdAt`; a stable sort here is what
    // makes the running balance (and the reversed, newest-first return)
    // actually chronological rather than insertion-order-by-accident.
    const oldestFirst = [...movements].sort(
      (a, b) => a.createdAt - b.createdAt,
    );

    let runningBalance = 0;
    const rows = oldestFirst.map((m) => {
      runningBalance += m.quantity;
      return {
        _id: m._id,
        type: m.type,
        createdAt: m.createdAt,
        netChange: m.quantity,
        runningBalance,
        lineTotal:
          m.type === "sale" && m.unitPriceAtSale !== undefined
            ? -m.quantity * m.unitPriceAtSale
            : undefined,
        reasonCategory: m.reasonCategory,
        reasonNotes: m.reasonNotes,
      };
    });

    return rows.reverse();
  },
});
