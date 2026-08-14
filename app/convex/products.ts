import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { filterLifecycle } from "./lifecycle";
import { unitValidator } from "./schema";

const DEFAULT_THRESHOLD = 10;

/**
 * The Unit a movement or a sale line names, looked up once here rather than
 * every caller re-running its own `.find` — `sales.ts` and
 * `stockMovements.ts`'s `recordMovement` both need exactly this lookup.
 */
export function findUnit(product: Doc<"products">, label: string) {
  const unit = product.units.find((u) => u.label === label);
  if (!unit) {
    throw new Error(`"${label}" is not a Unit on "${product.name}"`);
  }
  return unit;
}

/**
 * The invariants a product's Units must hold at creation — at least one, each
 * with a non-empty, unique label and a positive price, a whole-number Base
 * equivalent, and exactly one of them named as the Base unit with a Base
 * equivalent of 1. No `pc` is seeded anywhere upstream of this: a plausible
 * default is how a product ends up based in the wrong Unit — see
 * docs/adr/0004-base-unit-locked.md.
 */
function validateUnits(
  units: { label: string; baseEquivalent: number; price: number }[],
  baseUnitLabel: string,
) {
  if (units.length === 0) {
    throw new Error("A product needs at least one Unit");
  }
  // Case-insensitive, matching the product form's own duplicate check — "Tray"
  // and "tray" read as the same Unit to a shopkeeper typing quickly, so the
  // server has to refuse what the client already would.
  const labels = new Set<string>();
  for (const unit of units) {
    if (!unit.label.trim()) {
      throw new Error("A Unit needs a label");
    }
    const key = unit.label.trim().toLowerCase();
    if (labels.has(key)) {
      throw new Error(`"${unit.label}" is used by more than one Unit`);
    }
    labels.add(key);
    if (!Number.isInteger(unit.baseEquivalent) || unit.baseEquivalent <= 0) {
      throw new Error(
        `"${unit.label}"'s Base equivalent must be a positive whole number`,
      );
    }
    if (unit.price <= 0) {
      throw new Error(`"${unit.label}" needs a positive price`);
    }
  }
  const baseUnit = units.find((u) => u.label === baseUnitLabel);
  if (!baseUnit) {
    throw new Error(`Base unit "${baseUnitLabel}" is not one of the Units`);
  }
  if (baseUnit.baseEquivalent !== 1) {
    throw new Error("The Base unit's Base equivalent must be 1");
  }
}

/**
 * An archived product is never nagging her about restocking it — she's
 * decided she isn't restocking it, that's what archiving means — so it
 * carries no low-stock status at all rather than a status nobody reads.
 * Negative first among the active cases, and it has to stay first: a
 * negative count is also `<= threshold`, so the low case would swallow it and
 * render "order more" over what is really "this count is wrong, recount".
 */
function withStatus<
  T extends {
    quantityOnHand: number;
    lowStockThreshold?: number;
    archivedAt?: number;
  },
>(product: T, globalThreshold: number) {
  if (product.archivedAt !== undefined) {
    return { ...product, lowStockStatus: undefined };
  }
  const threshold = product.lowStockThreshold ?? globalThreshold;
  const lowStockStatus =
    product.quantityOnHand < 0
      ? ("negative" as const)
      : product.quantityOnHand <= threshold
        ? ("low" as const)
        : ("ok" as const);
  return { ...product, lowStockStatus };
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    // Every caller that doesn't ask otherwise gets active products only — a
    // picker, the Register grid, the Products list's main section. Only the
    // collapsed Archived section asks for `"withArchived"`.
    include: v.optional(
      v.union(v.literal("active"), v.literal("withArchived")),
    ),
  },
  handler: async (ctx, { search, include }) => {
    const settings = await ctx.db.query("appSettings").first();
    const globalThreshold = settings?.lowStockThreshold ?? DEFAULT_THRESHOLD;

    const all = await ctx.db.query("products").collect();
    const lifecycleFiltered = filterLifecycle(all, include ?? "active");
    const filtered = search
      ? lifecycleFiltered.filter((p) =>
          p.name.toLowerCase().includes(search.toLowerCase()),
        )
      : lifecycleFiltered;

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
    units: v.array(unitValidator),
    baseUnitLabel: v.string(),
    // Optional, defaulting to 0: the product form no longer collects a
    // starting count — delivery logging is the only way to raise one. This
    // stays an arg (rather than disappearing) for callers that legitimately
    // know a count up front, like the opening-balance backfill's fixtures.
    quantityOnHand: v.optional(v.number()),
    lowStockThreshold: v.optional(v.number()),
  },
  handler: async (ctx, { quantityOnHand, units, baseUnitLabel, ...args }) => {
    validateUnits(units, baseUnitLabel);
    return await ctx.db.insert("products", {
      ...args,
      units,
      baseUnitLabel,
      quantityOnHand: quantityOnHand ?? 0,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    // No `units`, `baseUnitLabel`, or `quantityOnHand` here, deliberately.
    // The Base unit is locked once a product has movements (see
    // docs/adr/0004-base-unit-locked.md); correcting or removing a Unit is a
    // later ticket. Delivery (and pull-out) logging are the only writers of a
    // product's count from here on — see `stockMovements.ts`.
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

/**
 * One-way and gated on both halves of the state the client can't be trusted
 * to have checked: archived (she's decided it isn't coming back) and empty
 * (nothing on hand to blank out of the ledger's arithmetic) — a negative
 * count fails this too, since a deleted-while-negative product would be an
 * unreconcilable cache row with no UI left to repair it. The UI disables the
 * button on this same pair of conditions, but that's an affordance; this
 * throw is the guarantee. A soft patch rather than `ctx.db.delete`, so
 * `quantityOnHand` and every `stockMovements` row survive untouched and a
 * deleted product's name keeps rendering wherever it's already been named.
 */
export const remove = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    const product = await ctx.db.get(id);
    if (!product) throw new Error("Product not found");
    if (product.archivedAt === undefined) {
      throw new Error("Only an archived product can be deleted");
    }
    if (product.quantityOnHand !== 0) {
      throw new Error(
        `${product.quantityOnHand} still on hand — pull them out first`,
      );
    }
    await ctx.db.patch(id, { deletedAt: Date.now() });
  },
});

/**
 * Archive is reversible, so it is never gated — no stock check, no
 * `allowNegative`-style confirm flag. Whether to warn her that the product
 * still holds stock is judged client-side, from the count `products.get`
 * already gives her; this mutation just does the one thing archiving means:
 * it stops the product from being selectable. `quantityOnHand` and every
 * `stockMovements` row are untouched — archive changes visibility, never
 * arithmetic.
 */
export const archive = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: Date.now() });
  },
});

/**
 * The one-tap reversal — no confirm, because gating the reversible action is
 * exactly the mistake the two-state model exists to avoid.
 */
export const unarchive = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: undefined });
  },
});
