import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { filterLifecycle } from "./lifecycle";
import { formatStock } from "./remainderReading";
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
 * The Unit a fresh line should preselect when none is named — "unset falls
 * back to the Base unit" (see the `defaultUnitLabel` schema comment), decided
 * once here so `withStatus` and every mutation that defaults an omitted
 * `unitLabel` (deliveries, entry edits) agree on the same fallback.
 */
export function resolveDefaultUnitLabel(product: {
  defaultUnitLabel?: string;
  baseUnitLabel: string;
}) {
  return product.defaultUnitLabel ?? product.baseUnitLabel;
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

/** The Default unit is optional, but if named it has to be a real Unit. */
function validateDefaultUnit(
  units: { label: string }[],
  defaultUnitLabel: string | null | undefined,
) {
  if (
    defaultUnitLabel != null &&
    !units.some((u) => u.label === defaultUnitLabel)
  ) {
    throw new Error(
      `Default unit "${defaultUnitLabel}" is not one of the Units`,
    );
  }
}

/**
 * The Default Unit *object* a product resolves to — `resolveDefaultUnitLabel`
 * only gives the label. `withStatus` attaches it to every product a reader
 * gets, so the price a listing quotes and the Unit a movement preselects both
 * come off one resolution of "unset falls back to the Base unit". It has no
 * say in how stock *reads* — that is the Reading ladder's job now
 * (remainderReading.ts).
 */
function resolveDefaultUnit<
  T extends {
    units: { label: string; baseEquivalent: number; price: number }[];
    baseUnitLabel: string;
    defaultUnitLabel?: string;
  },
>(product: T) {
  return (
    product.units.find((u) => u.label === resolveDefaultUnitLabel(product)) ??
    product.units[0]
  );
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
    units: { label: string; baseEquivalent: number; price: number }[];
    baseUnitLabel: string;
    defaultUnitLabel?: string;
  },
>(product: T, globalThreshold: number) {
  const defaultUnit = resolveDefaultUnit(product);
  if (product.archivedAt !== undefined) {
    return { ...product, lowStockStatus: undefined, defaultUnit };
  }
  const threshold = product.lowStockThreshold ?? globalThreshold;
  const lowStockStatus =
    product.quantityOnHand < 0
      ? ("negative" as const)
      : product.quantityOnHand <= threshold
        ? ("low" as const)
        : ("ok" as const);
  return { ...product, lowStockStatus, defaultUnit };
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
    // Whether the product has any movement at all — not the same as a nonzero
    // count, since a delivery and a matching sale net back to zero. It's what
    // locks the Base unit (ADR-0004), so the edit form reads it to disable the
    // Base radio rather than letting her try a reassignment the mutation will
    // only refuse.
    const firstMovement = await ctx.db
      .query("stockMovements")
      .withIndex("by_product", (q) => q.eq("productId", id))
      .first();
    return {
      ...withStatus(product, settings?.lowStockThreshold ?? DEFAULT_THRESHOLD),
      hasMovements: firstMovement !== null,
    };
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    units: v.array(unitValidator),
    baseUnitLabel: v.string(),
    defaultUnitLabel: v.optional(v.string()),
    lowStockThreshold: v.optional(v.number()),
    // The Reading ladder, same posture as in `update`: labels are stored as
    // given and resolved on every read, so nothing here has to be kept in
    // step with a later Unit rename or removal.
    denominationLabels: v.optional(v.array(v.string())),
  },
  // Always born at zero. Delivery logging is the only way to raise a count,
  // so there is no starting number to take from a caller — and none that the
  // ledger couldn't account for.
  handler: async (ctx, { units, baseUnitLabel, defaultUnitLabel, ...args }) => {
    validateUnits(units, baseUnitLabel);
    validateDefaultUnit(units, defaultUnitLabel);
    return await ctx.db.insert("products", {
      ...args,
      units,
      baseUnitLabel,
      defaultUnitLabel,
      quantityOnHand: 0,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    // The Unit list and the Base unit marker. Correcting a Unit's price or
    // Base equivalent, adding a Unit, and removing a non-Base one are all
    // ordinary edits — the per-row snapshot (docs/adr/0003-base-unit-storage.md)
    // is what keeps them from touching a single past movement. Two rules ride
    // along, both enforced below: the Base unit may never leave the list, and
    // it may be reassigned only while the product has no movements
    // (docs/adr/0004-base-unit-locked.md). `quantityOnHand` stays out —
    // delivery and pull-out logging are its only writers (see
    // `stockMovements.ts`).
    units: v.optional(v.array(unitValidator)),
    baseUnitLabel: v.optional(v.string()),
    // The Default unit carries no lock — it's a display/preselection choice,
    // not a ledger unit, so it's free to change at any time. null clears it
    // back to "unset" (falls back to the Base unit); omitted leaves the
    // existing value untouched (Convex drops `undefined` args before the
    // mutation runs, so `undefined` can't signal "clear").
    defaultUnitLabel: v.optional(v.union(v.string(), v.null())),
    // null clears the per-product override back to the global default;
    // omitted leaves the existing value untouched (Convex drops `undefined`
    // args before the mutation runs, so `undefined` can't signal "clear").
    lowStockThreshold: v.optional(v.union(v.number(), v.null())),
    // The Reading ladder. An empty array is the clear — it already means
    // "read plainly", so unlike the two fields above this needs no null; an
    // explicit value always wins, and omitted leaves it untouched. Labels are
    // stored as given: which ones actually count, and in what order, is
    // decided on every read by `buildReadingLadder` rather than at write time,
    // so a Unit renamed or deleted later degrades the reading instead of
    // leaving a wrong one stored.
    denominationLabels: v.optional(v.array(v.string())),
  },
  handler: async (
    ctx,
    {
      id,
      name,
      units,
      baseUnitLabel,
      defaultUnitLabel,
      lowStockThreshold,
      denominationLabels,
    },
  ) => {
    const patch: {
      name?: string;
      units?: typeof units;
      baseUnitLabel?: string;
      defaultUnitLabel?: string;
      lowStockThreshold?: number;
      denominationLabels?: string[];
    } = {};
    if (name !== undefined) patch.name = name;
    if (lowStockThreshold !== undefined) {
      patch.lowStockThreshold = lowStockThreshold ?? undefined;
    }
    if (denominationLabels !== undefined) {
      patch.denominationLabels = denominationLabels;
    }

    const touchesUnits = units !== undefined || baseUnitLabel !== undefined;
    if (touchesUnits || defaultUnitLabel !== undefined) {
      const product = await ctx.db.get(id);
      if (!product) throw new Error("Product not found");

      // Whatever half the caller left out stays as it is, so the invariants
      // below are always checked against the product's *resulting* state.
      const nextUnits = units ?? product.units;
      const nextBaseUnitLabel = baseUnitLabel ?? product.baseUnitLabel;

      if (touchesUnits) {
        // Rejects an empty list, a duplicate or blank label, a non-whole or
        // non-positive Base equivalent or price, and — the removal guard — a
        // Base unit that isn't present among the Units.
        validateUnits(nextUnits, nextBaseUnitLabel);

        // The Base unit is locked once movements exist: reinterpreting a
        // count denominated in the old Base against a new one is silent
        // corruption, and every past row's snapshot was taken against the old
        // Base too (ADR-0004). Before any movements there is nothing to
        // reinterpret, so reassignment is free.
        if (
          baseUnitLabel !== undefined &&
          baseUnitLabel !== product.baseUnitLabel
        ) {
          const firstMovement = await ctx.db
            .query("stockMovements")
            .withIndex("by_product", (q) => q.eq("productId", id))
            .first();
          if (firstMovement) {
            throw new Error(
              `"${product.name}"'s Base unit is locked because it already has recorded movements — ` +
                "reassigning it would silently reinterpret every past count. " +
                "To base the product on a different Unit, archive it and recreate it.",
            );
          }
        }

        patch.units = nextUnits;
        patch.baseUnitLabel = nextBaseUnitLabel;
      }

      // The Default unit: an explicit value is validated against the resulting
      // Unit list and wins. Otherwise, if the stored Default was one of the
      // Units just removed, clear it so the product falls back to leading with
      // its Base unit (see `withStatus`) rather than pointing at a Unit that's
      // gone.
      if (defaultUnitLabel !== undefined) {
        validateDefaultUnit(nextUnits, defaultUnitLabel);
        patch.defaultUnitLabel = defaultUnitLabel ?? undefined;
      } else if (
        product.defaultUnitLabel !== undefined &&
        !nextUnits.some((u) => u.label === product.defaultUnitLabel)
      ) {
        patch.defaultUnitLabel = undefined;
      }
    }

    await ctx.db.patch(id, patch);
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
      const formattedQuantity = formatStock(product);
      throw new Error(
        `${formattedQuantity} still on hand — pull them out first`,
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
