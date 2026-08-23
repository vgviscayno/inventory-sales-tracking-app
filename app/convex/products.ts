import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { filterLifecycle } from "./lifecycle";
import {
  thresholdInDefaultUnits,
  thresholdToBaseUnits,
} from "./lowStockThreshold";
import { formatStock } from "./remainderReading";
import { unitValidator } from "./schema";

// The shop-wide low-stock threshold when `appSettings` holds no row. The
// table holds one row, and no function here writes it. The Convex dashboard
// is the only way to set another number.
// This number counts each product's own Default unit, and not Base units. One
// `10` therefore means "under ten of however I sell it". See "Low-stock
// threshold" in CONTEXT.md, and see `withStatus`.
const DEFAULT_THRESHOLD = 10;

/**
 * The Unit a Movement names. The lookup lives here once. `sales.ts` and
 * `recordMovement` in `stockMovements.ts` both need this exact lookup, so
 * neither runs a `.find` of its own.
 */
export function findUnit(product: Doc<"products">, label: string) {
  const unit = product.units.find((u) => u.label === label);
  if (!unit) {
    throw new Error(`"${label}" is not a Unit on "${product.name}"`);
  }
  return unit;
}

/**
 * The Unit a fresh Line preselects when nothing names one. An unset Default
 * unit falls back to the Base unit. See the `defaultUnitLabel` comment in
 * schema.ts.
 * The rule lives here once. `withStatus` and every mutation that defaults an
 * omitted `unitLabel` therefore agree on one fallback. Delivery create and
 * Entry edit are two such mutations.
 */
export function resolveDefaultUnitLabel(product: {
  defaultUnitLabel?: string;
  baseUnitLabel: string;
}) {
  return product.defaultUnitLabel ?? product.baseUnitLabel;
}

/**
 * The invariants a product's Units hold at creation. There is at least one
 * Unit. Each Unit has a unique label that is not empty, a positive price, and a
 * whole-number Base equivalent. Exactly one Unit is the Base unit, and its Base
 * equivalent is 1.
 * Nothing upstream seeds a `pc` Unit. A plausible default is how a product ends
 * up based in the wrong Unit. See docs/adr/0004-base-unit-locked.md.
 */
function validateUnits(
  units: { label: string; baseEquivalent: number; price: number }[],
  baseUnitLabel: string,
) {
  if (units.length === 0) {
    throw new Error("A product needs at least one Unit");
  }
  // Case-insensitive, the same as the duplicate check in the product form. A
  // shopkeeper who types quickly reads "Tray" and "tray" as one Unit. The
  // server therefore refuses what the client already refuses.
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

/** The Default unit is optional. A named Default unit must be a real Unit. */
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
 * The Default unit object a product resolves to. `resolveDefaultUnitLabel`
 * gives only the label.
 * `withStatus` attaches this object to every product a reader gets. The price a
 * listing quotes and the Unit a Movement preselects therefore come from one
 * resolution of the fallback.
 * This object has no say in how stock reads. The Reading ladder decides that.
 * See remainderReading.ts.
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
 * An archived product carries no low-stock status. To archive a product is to
 * decide against restocking it, so a low-stock status there is a status nobody
 * reads.
 * Among the active cases, the negative case comes first, and it must stay
 * first. A negative count is also `<= threshold`. The low case would otherwise
 * swallow it. It would show "order more" over what really means "this count is
 * wrong, recount".
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
  // The stored override read back in the Default unit. The form shows this
  // number, so the shopkeeper reads "5" where she typed "5". See
  // lowStockThreshold.ts.
  const lowStockThresholdInDefaultUnits =
    product.lowStockThreshold === undefined
      ? undefined
      : thresholdInDefaultUnits(product.lowStockThreshold, defaultUnit);
  if (product.archivedAt !== undefined) {
    return {
      ...product,
      lowStockStatus: undefined,
      lowStockThresholdInDefaultUnits,
      defaultUnit,
    };
  }
  // The per-product override already stores Base units. The shop-wide number
  // counts Default units, so it converts here, on every read.
  const threshold =
    product.lowStockThreshold ?? globalThreshold * defaultUnit.baseEquivalent;
  const lowStockStatus =
    product.quantityOnHand < 0
      ? ("negative" as const)
      : product.quantityOnHand <= threshold
        ? ("low" as const)
        : ("ok" as const);
  return {
    ...product,
    lowStockStatus,
    lowStockThresholdInDefaultUnits,
    defaultUnit,
  };
}

export const list = query({
  args: {
    search: v.optional(v.string()),
    // A caller that asks for nothing gets active products only. This covers a
    // picker, the Register grid, and the main section of the Products list.
    // Only the collapsed Archived section asks for `"withArchived"`.
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
    // Whether the product has any Movement at all. This is not the same as a
    // nonzero count, because a Delivery and a matching Sale net back to zero.
    // This flag is what locks the Base unit. See
    // docs/adr/0004-base-unit-locked.md. The edit form reads it and disables
    // the Base radio, instead of offering a reassignment the mutation refuses.
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
    // The per-product threshold, counted in the Default unit this call names.
    // The row stores Base units under `lowStockThreshold`. The arg spells its
    // own denomination out. The two numbers differ by a factor nobody can see
    // at the call site. See lowStockThreshold.ts.
    lowStockThresholdInDefaultUnits: v.optional(v.number()),
    // The Reading ladder, with the same posture as in `update`. The row stores
    // the labels as given, and every read resolves them. Nothing here therefore
    // has to keep step with a later Unit rename or removal.
    denominationLabels: v.optional(v.array(v.string())),
  },
  // A product is always born at zero. A Delivery is the only way to raise a
  // count, so this mutation takes no starting number. A starting number is also
  // a number the Ledger cannot account for.
  handler: async (
    ctx,
    {
      units,
      baseUnitLabel,
      defaultUnitLabel,
      lowStockThresholdInDefaultUnits,
      ...args
    },
  ) => {
    validateUnits(units, baseUnitLabel);
    validateDefaultUnit(units, defaultUnitLabel);
    return await ctx.db.insert("products", {
      ...args,
      units,
      baseUnitLabel,
      defaultUnitLabel,
      lowStockThreshold:
        lowStockThresholdInDefaultUnits === undefined
          ? undefined
          : thresholdToBaseUnits(
              lowStockThresholdInDefaultUnits,
              resolveDefaultUnit({ units, baseUnitLabel, defaultUnitLabel }),
            ),
      quantityOnHand: 0,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("products"),
    name: v.optional(v.string()),
    // The Unit list and the Base unit marker. To correct a Unit's price or
    // Base equivalent is an ordinary edit. To add a Unit is another. So is the
    // drop of a Unit that is not the Base unit.
    // The per-row snapshot keeps all three off every past Movement. See
    // docs/adr/0003-base-unit-storage.md.
    // Two rules ride along, and the handler below enforces both. The Base unit
    // never leaves the list. A reassignment of the Base unit is allowed only
    // while the product has no Movements. See
    // docs/adr/0004-base-unit-locked.md.
    // `quantityOnHand` stays out of this mutation. A Delivery and a Pull-out
    // are its only writers. See `stockMovements.ts`.
    units: v.optional(v.array(unitValidator)),
    baseUnitLabel: v.optional(v.string()),
    // The Default unit carries no lock. It is a display choice and a
    // preselection choice, and not a Ledger Unit, so it changes at any time.
    // `null` clears it back to unset, which falls back to the Base unit. An
    // omitted value leaves the stored value untouched. Convex drops an
    // `undefined` arg before the mutation runs, so `undefined` cannot mean
    // "clear".
    defaultUnitLabel: v.optional(v.union(v.string(), v.null())),
    // The per-product threshold, counted in the Default unit the product leads
    // with right now. A Default unit this same call nominates does not
    // denominate it. The form the number came from carried the old label. See
    // lowStockThreshold.ts.
    // `null` clears the override back to the shop-wide default. An omitted
    // value leaves the stored value untouched. Convex drops an `undefined` arg
    // before the mutation runs, so `undefined` cannot mean "clear".
    lowStockThresholdInDefaultUnits: v.optional(v.union(v.number(), v.null())),
    // The Reading ladder. An empty array is the clear, because an empty ladder
    // already means the plain reading. This field therefore needs no `null`,
    // unlike the two fields above. An explicit value always wins, and an
    // omitted value leaves the stored value untouched.
    // The row stores the labels as given. `buildReadingLadder` decides on every
    // read which labels count, and in what order. A Unit that somebody renames
    // or deletes later therefore degrades the reading. It does not leave a
    // wrong reading stored.
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
      lowStockThresholdInDefaultUnits,
      denominationLabels,
    },
  ) => {
    // Every branch below needs the product as it stands. The threshold needs
    // the Default unit it is entered in, and the Unit rules need whichever
    // half of the state this call left out.
    const product = await ctx.db.get(id);
    if (!product) throw new Error("Product not found");

    const patch: {
      name?: string;
      units?: typeof units;
      baseUnitLabel?: string;
      defaultUnitLabel?: string;
      lowStockThreshold?: number;
      denominationLabels?: string[];
    } = {};
    if (name !== undefined) patch.name = name;
    if (lowStockThresholdInDefaultUnits !== undefined) {
      patch.lowStockThreshold =
        lowStockThresholdInDefaultUnits === null
          ? undefined
          : thresholdToBaseUnits(
              lowStockThresholdInDefaultUnits,
              resolveDefaultUnit(product),
            );
    }
    if (denominationLabels !== undefined) {
      patch.denominationLabels = denominationLabels;
    }

    const touchesUnits = units !== undefined || baseUnitLabel !== undefined;
    if (touchesUnits || defaultUnitLabel !== undefined) {
      // Whichever half the caller left out stays as it is. The invariants
      // below therefore always check the product's resulting state.
      const nextUnits = units ?? product.units;
      const nextBaseUnitLabel = baseUnitLabel ?? product.baseUnitLabel;

      if (touchesUnits) {
        // This call rejects an empty list, a duplicate label, and a blank
        // label. It rejects a Base equivalent or a price that is not whole or
        // not positive. It also holds the removal guard: the Base unit must
        // still be one of the Units.
        validateUnits(nextUnits, nextBaseUnitLabel);

        // The Base unit locks once Movements exist. To read a count held in
        // the old Base unit against a new one is silent corruption. Every past
        // row also took its snapshot against the old Base unit. See
        // docs/adr/0004-base-unit-locked.md.
        // Before the first Movement there is nothing to reinterpret, so a
        // reassignment is free.
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

      // The Default unit. An explicit value passes validation against the
      // resulting Unit list, and then wins.
      // Otherwise, this edit may have removed the Unit the stored Default unit
      // names. The clear then makes the product lead with its Base unit. See
      // `withStatus`. A Default unit that points at a Unit which is gone does
      // not survive.
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
 * Delete is one way. It gates on two halves of the state that the client
 * cannot be trusted to have checked.
 * The product is archived, which is the decision that it is not coming back.
 * The product is empty. A delete must not blank a count out of the Ledger's
 * arithmetic. A negative count fails this gate too. A product deleted while
 * negative leaves a cache row nobody can reconcile, and no screen to repair it.
 * The screen disables the button on this same pair of conditions. That is an
 * affordance. This throw is the guarantee.
 * The handler patches a timestamp and does not call `ctx.db.delete`.
 * `quantityOnHand` and every `stockMovements` row therefore survive untouched.
 * A deleted product still shows its name wherever it is already named.
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
 * Archive is reversible, so nothing gates it. There is no stock check and no
 * confirm flag in the style of `allowNegative`.
 * The client decides whether to warn that the product still holds stock, from
 * the count `products.get` already gives it.
 * This mutation does the one thing Archive means. It stops the product from
 * being selectable. `quantityOnHand` and every `stockMovements` row stay
 * untouched. Archive changes visibility and never arithmetic.
 */
export const archive = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: Date.now() });
  },
});

/**
 * The one-tap reversal. There is no confirm. To gate the reversible action is
 * the mistake the two-state lifecycle exists to avoid.
 */
export const unarchive = mutation({
  args: { id: v.id("products") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { archivedAt: undefined });
  },
});
