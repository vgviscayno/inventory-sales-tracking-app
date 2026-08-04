import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/**
 * The sign each movement type carries. A `stockMovements` row stores `quantity`
 * as a signed delta so every cache update is a plain add with no per-type
 * branching — but that sign is redundant with the `type` sitting beside it, and
 * a schema comment is not what stops a positive pull-out. This table is. It is
 * the only place in the codebase that knows which way a type moves stock.
 */
const DIRECTION = {
  opening: 1,
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
  | { type: "opening" }
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
