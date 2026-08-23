import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { roundCentavos } from "./money";
import { findNegativeProjections } from "./negativeProjections";
import { findUnit, resolveDefaultUnitLabel } from "./products";

// The fixed reason set for a Pull-out. It lives here and not in pullouts.ts,
// because `pullouts.create` and `stockMovements.editEntry` both write the same
// field on the same rows. One set therefore cannot drift into two.
export const reasonCategory = v.union(
  v.literal("damaged"),
  v.literal("expired"),
  v.literal("personal use"),
  v.literal("given away"),
  v.literal("other"),
);

/**
 * The sign each Movement type carries. A `stockMovements` row holds a signed
 * delta, so a cache update is a plain add with no per-type branch.
 * The sign duplicates the `type` beside it. A schema comment does not stop a
 * positive Pull-out. This table does.
 * This table is the only place that knows which way a type moves stock. Every
 * row in the Ledger goes through it. There is no second write path.
 */
const DIRECTION = {
  delivery: 1,
  sale: -1,
  pullout: -1,
} as const;

/**
 * The per-type fields. Each field belongs to the one type that may carry it.
 * A Pull-out reason on a Sale is therefore a type error. So is a Sale price on
 * a Delivery. Neither reaches the table as a row nobody notices.
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
  // The Unit this Movement was entered in. It must name one of the product's
  // `units`. `recordMovement` resolves it to find the Base equivalent to
  // snapshot, so no caller has to look that up.
  unitLabel: string;
  /** How many of that Unit moved. It is a magnitude and never signed. */
  unitQuantity: number;
};

/**
 * The Base amount a row's snapshot comes to. The app never stores it and
 * derives it on every read. See docs/adr/0003-base-unit-storage.md.
 * The result rounds. A decimal Unit quantity carries float noise (`1.7 * 1000`
 * is not `1700`). That noise must never reach `quantityOnHand`, which the app
 * writes back rather than recomputes.
 */
export function deriveBaseAmount(m: {
  unitQuantity: number;
  baseEquivalentAtEntry: number;
}): number {
  return Math.round(m.unitQuantity * m.baseEquivalentAtEntry);
}

/**
 * Write one Movement and move the product's cached count with it.
 * The two halves are the invariant this module exists to protect. No caller
 * does one half without the other.
 */
export async function recordMovement(ctx: MutationCtx, movement: Movement) {
  if (movement.unitQuantity < 0) {
    throw new Error(
      `A ${movement.type} movement takes a magnitude, not a signed quantity (got ${movement.unitQuantity})`,
    );
  }

  const product = await ctx.db.get(movement.productId);
  if (!product) throw new Error("Product not found");
  const unit = findUnit(product, movement.unitLabel);

  const signedUnitQuantity = DIRECTION[movement.type] * movement.unitQuantity;
  const baseDelta =
    DIRECTION[movement.type] *
    Math.round(movement.unitQuantity * unit.baseEquivalent);

  await ctx.db.insert("stockMovements", {
    ...movement,
    unitQuantity: signedUnitQuantity,
    baseEquivalentAtEntry: unit.baseEquivalent,
    createdAt: Date.now(),
  });
  await ctx.db.patch(movement.productId, {
    quantityOnHand: product.quantityOnHand + baseDelta,
  });
}

/**
 * What a Sale charged. The total derives from the Sale's Ledger rows. The app
 * never stores it.
 * A Sale's Unit quantities are negative, so each Line amount subtracts to reach
 * a positive total.
 * Each Line rounds to centavos before it joins the sum. The printed Lines of a
 * receipt therefore add up to its printed total.
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
    return total + roundCentavos(-m.unitQuantity * m.unitPriceAtSale);
  }, 0);
}

/**
 * The per-product Ledger the product detail page reads. It holds every Movement
 * that ever changed this product's count, newest first. Each row carries the
 * running balance immediately after it.
 * This query folds oldest-first and reverses the result. It never walks
 * backwards from `quantityOnHand`. A backwards walk agrees in silence with a
 * cache that drifted from its own Ledger. This fold derives the balance from
 * the rows alone. `expectCacheMatchesLedger` checks the cache against that
 * same source.
 *
 * `netChange` names the signed quantity. The day-grouped list on the Movements
 * tab keys its headings on that same field. This Ledger therefore reuses the
 * list component, and not a second copy.
 */
export const listForProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, { productId }) => {
    const movements = await ctx.db
      .query("stockMovements")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .collect();

    // `by_product` does not order by `createdAt`. A stable sort here makes the
    // running balance chronological, and the reversed return with it.
    // Insertion order does not.
    const oldestFirst = [...movements].sort(
      (a, b) => a.createdAt - b.createdAt,
    );

    // The fold is synchronous and runs before the `await`s below. Those awaits
    // run concurrently over the whole array. A shared counter inside an async
    // callback races against them. Each row then reads whatever the counter
    // holds when its own lookup resolves. It misses the value at its own turn.
    let runningBalance = 0;
    const balances = oldestFirst.map(
      (m) => (runningBalance += deriveBaseAmount(m)),
    );

    const rows = await Promise.all(
      oldestFirst.map(async (m, i) => {
        // A Delivery row's supplier lives on the `deliveries` header and not
        // on the Movement. `ctx.db.get` on both hops bypasses the lifecycle
        // filter, the same way the customer join in `sales.list` does. An
        // archived or deleted supplier therefore still shows its name here.
        let supplierName: string | undefined;
        if (m.type === "delivery" && m.refId !== undefined) {
          const delivery = await ctx.db.get(m.refId as Id<"deliveries">);
          if (delivery?.supplierId !== undefined) {
            const supplier = await ctx.db.get(delivery.supplierId);
            supplierName = supplier?.name;
          }
        }
        return {
          _id: m._id,
          type: m.type,
          // Always set. Every row belongs to an Entry the Ledger can open.
          refId: m.refId,
          createdAt: m.createdAt,
          // Signed, in Base units. The running balance folds from this figure.
          // `unitLabel` and `unitQuantity` below are what the row reads back as
          // ("2 trays"). They give a different figure once the Unit is not the
          // Base unit.
          netChange: deriveBaseAmount(m),
          runningBalance: balances[i],
          unitLabel: m.unitLabel,
          unitQuantity: m.unitQuantity,
          lineTotal:
            m.type === "sale" && m.unitPriceAtSale !== undefined
              ? roundCentavos(-m.unitQuantity * m.unitPriceAtSale)
              : undefined,
          reasonCategory: m.reasonCategory,
          reasonNotes: m.reasonNotes,
          supplierName,
        };
      }),
    );

    return rows.reverse();
  },
});

/**
 * Every Line a header row carries, for a Delivery, a Pull-out, or a Sale. Each
 * Line joins to the product name at the moment of the read. Each Line carries
 * the `movementId` that identifies it for an edit.
 * `deliveries.list`, `pullouts.list`, `sales.list`, and the prefill of
 * `editEntry` all read Lines through this one shape. None of them re-derives
 * the shape from `stockMovements`.
 */
export async function entryLines(
  ctx: QueryCtx,
  refId: Id<"deliveries"> | Id<"pullouts"> | Id<"sales">,
) {
  const movements = await ctx.db
    .query("stockMovements")
    .withIndex("by_refId", (q) => q.eq("refId", refId))
    .collect();

  return await Promise.all(
    movements.map(async (m) => {
      const product = await ctx.db.get(m.productId);
      return {
        movementId: m._id,
        productId: m.productId,
        productName: product?.name ?? "Deleted product",
        // Signed, in the Unit the Line was entered in. This is what lets a
        // Sale read back as "2 trays" and not as "60 pieces". Nothing calls the
        // field `quantity` alone.
        // Every other fold over the Ledger works in Base amounts, so this shape
        // derives `baseAmount` too. No caller re-derives it from `unitLabel`
        // and `unitQuantity`. See "Unit quantity" in CONTEXT.md.
        unitLabel: m.unitLabel,
        unitQuantity: m.unitQuantity,
        baseAmount: deriveBaseAmount(m),
        // The Movements tab merges two Lines only where this figure agrees
        // too. The label alone does not identify a Unit. See
        // src/app/movements/entryReading.ts.
        baseEquivalentAtEntry: m.baseEquivalentAtEntry,
      };
    }),
  );
}

const entryRef = v.union(
  v.object({ type: v.literal("delivery"), entryId: v.id("deliveries") }),
  v.object({ type: v.literal("pullout"), entryId: v.id("pullouts") }),
  v.object({ type: v.literal("sale"), entryId: v.id("sales") }),
);

/**
 * One Entry's Lines, and the reason for a Pull-out. The edit sheet prefills
 * from this query when it opens by `refId` alone. A tap on a product Ledger row
 * carries nothing more.
 * The Movements tab holds the fuller Entry object from its own list query and
 * does not need this query. Both openers route through the same fetch, so the
 * prefill of the sheet stays single. It does not branch on the origin of the
 * tap.
 */
export const getEntry = query({
  args: { entry: entryRef },
  handler: async (ctx, { entry }) => {
    const lines = await entryLines(ctx, entry.entryId);
    const reasonRow =
      entry.type === "pullout"
        ? await ctx.db
            .query("stockMovements")
            .withIndex("by_refId", (q) => q.eq("refId", entry.entryId))
            .first()
        : null;
    const delivery =
      entry.type === "delivery" ? await ctx.db.get(entry.entryId) : null;

    return {
      lines,
      reasonCategory: reasonRow?.reasonCategory,
      reasonNotes: reasonRow?.reasonNotes,
      supplierId: delivery?.supplierId,
    };
  },
});

/**
 * A correction to an existing Delivery or Pull-out. The caller sends the full
 * desired Line set. Some Lines carry the `movementId` of a row they still
 * describe, and some Lines are new. This mutation diffs that set against what
 * the Entry holds today.
 * A Line whose `movementId` survives with a changed Unit quantity takes a patch
 * by the difference. A Line that disappears takes a delete, and its delta
 * reverses. A Line with no `movementId` is a fresh insert.
 * This mutation refuses a Sale Entry. The Register edits a Sale.
 * The Negative projection warning is the one `sales.create` and
 * `pullouts.create` carry. It judges the Entry's net effect per product, and
 * not each Line. One Entry can touch one product on more than one Line.
 */
export const editEntry = mutation({
  args: {
    entry: entryRef,
    lines: v.array(
      v.object({
        movementId: v.optional(v.id("stockMovements")),
        productId: v.id("products"),
        // The Unit this Line's quantity is entered in.
        // A surviving Line carries a `movementId`, and may only repeat the Unit
        // it already has. See the guard below. An omitted Unit there means
        // "unchanged".
        // On a fresh Line an omitted Unit falls back to the product's Default
        // unit, the same as `deliveries.create`.
        // The field is optional, so a caller that sends no Unit at all keeps
        // working unmodified.
        unitLabel: v.optional(v.string()),
        quantity: v.number(),
      }),
    ),
    reasonCategory: v.optional(reasonCategory),
    reasonNotes: v.optional(v.string()),
    // Delivery only. It mirrors the notes trap in `customers.update`. An
    // omitted value leaves the Delivery's supplier untouched, `null` clears it
    // back to none, and an id changes it. A Pull-out ignores it.
    supplierId: v.optional(v.union(v.id("suppliers"), v.null())),
    // The same backstop as `allowNegative` on create. The client computes the
    // warning, so this flag records that a human saw it and agreed. One flag
    // covers the whole edit, and not one Line.
    allowNegative: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { entry, lines, reasonCategory, reasonNotes, supplierId, allowNegative },
  ) => {
    if (entry.type === "sale") {
      throw new Error("Sale entries are edited from the Register, not here");
    }
    if (lines.length === 0) {
      throw new Error(
        "An entry must keep at least one line — deleting the last one goes through deleting the entry",
      );
    }
    for (const line of lines) {
      if (line.quantity <= 0) {
        throw new Error("Each line must have a positive quantity");
      }
    }
    if (entry.type === "pullout") {
      if (!reasonCategory) {
        throw new Error("A pull-out needs a reason");
      }
      if (reasonCategory === "other" && !reasonNotes?.trim()) {
        throw new Error('A note is required when the reason is "other"');
      }
    }

    const existing = await ctx.db
      .query("stockMovements")
      .withIndex("by_refId", (q) => q.eq("refId", entry.entryId))
      .collect();
    // An Entry with no rows is not a mismatch the check below catches. That
    // check is vacuously true over an empty list. A bogus `entryId` with an
    // all-new Line set would otherwise pass. It would create Movements against
    // an id nothing else points to.
    if (existing.length === 0) {
      throw new Error(`Entry ${entry.entryId} does not exist`);
    }
    // `by_refId` only ever holds rows of one type for a given id. This
    // mutation takes `entry.type` from the caller and does not trust the rows.
    // A mismatch here means the sheet opened the wrong kind of Entry.
    if (existing.some((m) => m.type !== entry.type)) {
      throw new Error(`Entry ${entry.entryId} is not a ${entry.type}`);
    }

    if (entry.type === "delivery" && supplierId !== undefined) {
      await ctx.db.patch(entry.entryId, {
        supplierId: supplierId ?? undefined,
      });
    }

    const existingById = new Map(existing.map((m) => [m._id, m]));

    const referencedIds = new Set<Id<"stockMovements">>();
    for (const line of lines) {
      if (!line.movementId) continue;
      const movement = existingById.get(line.movementId);
      if (!movement) {
        throw new Error("This line no longer belongs to this entry");
      }
      if (movement.productId !== line.productId) {
        throw new Error(
          "A line's product can't change — remove it and add a new line instead",
        );
      }
      // A Unit change is not a quantity patch. The row snapshots `unitLabel`
      // and `baseEquivalentAtEntry` together. See
      // docs/adr/0003-base-unit-storage.md. To reinterpret one without the
      // other corrupts the row, the same way a product swap does.
      // The sheet still presents a Unit change as an ordinary edit. It drops
      // this Line's `movementId` and sends a fresh Line, which never reaches
      // this guard.
      if (
        line.unitLabel !== undefined &&
        line.unitLabel !== movement.unitLabel
      ) {
        throw new Error(
          "A line's Unit can't change — remove it and add a new line instead",
        );
      }
      referencedIds.add(line.movementId);
    }

    // Project every Line's contribution to each product's net delta before any
    // write. The Negative projection check then sees the whole Entry the way
    // the diff leaves it, and not Line by Line. This covers a product that two
    // Lines touch, and a dropped Line beside a raised one.
    const deltaLines: { productId: Id<"products">; delta: number }[] = [];
    for (const line of lines) {
      const signedUnitQuantity = DIRECTION[entry.type] * line.quantity;
      if (line.movementId) {
        const movement = existingById.get(line.movementId);
        if (movement) {
          deltaLines.push({
            productId: line.productId,
            delta:
              deriveBaseAmount({
                unitQuantity: signedUnitQuantity,
                baseEquivalentAtEntry: movement.baseEquivalentAtEntry,
              }) - deriveBaseAmount(movement),
          });
        }
      } else {
        const product = await ctx.db.get(line.productId);
        if (!product) throw new Error("Product not found");
        const unit = findUnit(
          product,
          line.unitLabel ?? resolveDefaultUnitLabel(product),
        );
        deltaLines.push({
          productId: line.productId,
          delta: Math.round(signedUnitQuantity * unit.baseEquivalent),
        });
      }
    }
    for (const movement of existing) {
      if (!referencedIds.has(movement._id)) {
        deltaLines.push({
          productId: movement.productId,
          delta: -deriveBaseAmount(movement),
        });
      }
    }

    if (!allowNegative) {
      // The loop takes one product at a time, in the order the Entry first
      // touches it. A missing product further down the Entry therefore cannot
      // shadow an earlier product's Negative projection message.
      const touchedProductIds = [
        ...new Set(deltaLines.map((l) => l.productId)),
      ];
      for (const productId of touchedProductIds) {
        const product = await ctx.db.get(productId);
        if (!product) throw new Error("Product not found");
        const negativeProjections = findNegativeProjections(
          deltaLines.filter((l) => l.productId === productId),
          [{ productId: product._id, quantityOnHand: product.quantityOnHand }],
        );
        if (negativeProjections.length > 0) {
          throw new Error(
            `This edit would leave "${product.name}" at ${negativeProjections[0].projected}. ` +
              `Confirm the count is wrong and record it anyway to proceed.`,
          );
        }
      }
    }

    // Dropped Lines: reverse the delta and delete the row.
    for (const movement of existing) {
      if (referencedIds.has(movement._id)) continue;
      const product = await ctx.db.get(movement.productId);
      if (!product) throw new Error("Product not found");
      await ctx.db.patch(movement.productId, {
        quantityOnHand: product.quantityOnHand - deriveBaseAmount(movement),
      });
      await ctx.db.delete(movement._id);
    }

    // Surviving Lines: patch the Unit quantity, which is a no-op when the delta
    // is zero. For a Pull-out, patch the reason too. The reason belongs to the
    // Entry once, but every row stores it, so a reason edit reaches every row.
    // The Unit cannot change on a surviving Line, which the guard above
    // enforces. `baseEquivalentAtEntry` therefore stays put, and only
    // `unitQuantity` takes a patch.
    for (const line of lines) {
      if (!line.movementId) continue;
      const movement = existingById.get(line.movementId);
      if (!movement) continue;
      const signedUnitQuantity = DIRECTION[entry.type] * line.quantity;
      const diff =
        deriveBaseAmount({
          unitQuantity: signedUnitQuantity,
          baseEquivalentAtEntry: movement.baseEquivalentAtEntry,
        }) - deriveBaseAmount(movement);
      if (diff !== 0) {
        const product = await ctx.db.get(line.productId);
        if (!product) throw new Error("Product not found");
        await ctx.db.patch(line.productId, {
          quantityOnHand: product.quantityOnHand + diff,
        });
      }
      await ctx.db.patch(movement._id, {
        unitQuantity: signedUnitQuantity,
        ...(entry.type === "pullout" ? { reasonCategory, reasonNotes } : {}),
      });
    }

    // New Lines: insert and move stock, the same as a fresh Entry. An omitted
    // Unit falls back to the product's Default unit, the same as
    // `deliveries.create`.
    for (const line of lines) {
      if (line.movementId) continue;
      const product = await ctx.db.get(line.productId);
      if (!product) throw new Error("Product not found");
      const unitLabel = line.unitLabel ?? resolveDefaultUnitLabel(product);
      if (entry.type === "pullout") {
        await recordMovement(ctx, {
          type: "pullout",
          refId: entry.entryId,
          productId: line.productId,
          unitLabel,
          unitQuantity: line.quantity,
          reasonCategory: reasonCategory as string,
          reasonNotes,
        });
      } else {
        await recordMovement(ctx, {
          type: "delivery",
          refId: entry.entryId,
          productId: line.productId,
          unitLabel,
          unitQuantity: line.quantity,
        });
      }
    }
  },
});

/**
 * Take back an Entry that should never have existed. Every Line under the
 * header reverses its own signed delta, and then the header goes.
 * This mutation refuses a Sale Entry, the same as `editEntry`. The Register
 * corrects a Sale.
 * This mutation judges the Negative projection warning the way `editEntry`
 * does. It takes the Entry's net effect per product, because one Entry can
 * touch one product on more than one Line.
 * Here every existing Movement reverses. There is no diff against a new Line
 * set.
 */
export const deleteEntry = mutation({
  args: {
    entry: entryRef,
    // The same backstop as `editEntry`'s. The client computes the warning, so
    // this flag records that a human saw it and agreed.
    allowNegative: v.optional(v.boolean()),
  },
  handler: async (ctx, { entry, allowNegative }) => {
    if (entry.type === "sale") {
      throw new Error("Sale entries are deleted from the Register, not here");
    }

    const existing = await ctx.db
      .query("stockMovements")
      .withIndex("by_refId", (q) => q.eq("refId", entry.entryId))
      .collect();
    // The same guard as `editEntry`'s. The create mutations never produce an
    // Entry with no rows. A bogus `entryId` still takes a refusal, because it
    // must not delete a header nothing points to.
    if (existing.length === 0) {
      throw new Error(`Entry ${entry.entryId} does not exist`);
    }
    if (existing.some((m) => m.type !== entry.type)) {
      throw new Error(`Entry ${entry.entryId} is not a ${entry.type}`);
    }

    if (!allowNegative) {
      const deltaLines = existing.map((movement) => ({
        productId: movement.productId,
        delta: -deriveBaseAmount(movement),
      }));
      // The loop takes one product at a time, in the order the Entry first
      // touches it. A missing product further down the Entry therefore cannot
      // shadow an earlier product's Negative projection message.
      const touchedProductIds = [
        ...new Set(deltaLines.map((l) => l.productId)),
      ];
      for (const productId of touchedProductIds) {
        const product = await ctx.db.get(productId);
        if (!product) throw new Error("Product not found");
        const negativeProjections = findNegativeProjections(
          deltaLines.filter((l) => l.productId === productId),
          [{ productId: product._id, quantityOnHand: product.quantityOnHand }],
        );
        if (negativeProjections.length > 0) {
          throw new Error(
            `Deleting this entry would leave "${product.name}" at ${negativeProjections[0].projected}. ` +
              `Confirm the count is wrong and delete it anyway to proceed.`,
          );
        }
      }
    }

    for (const movement of existing) {
      const product = await ctx.db.get(movement.productId);
      if (!product) throw new Error("Product not found");
      await ctx.db.patch(movement.productId, {
        quantityOnHand: product.quantityOnHand - deriveBaseAmount(movement),
      });
      await ctx.db.delete(movement._id);
    }

    await ctx.db.delete(entry.entryId);
  },
});
