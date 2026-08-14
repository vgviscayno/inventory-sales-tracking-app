import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  mutation,
  type QueryCtx,
  query,
} from "./_generated/server";
import { roundCentavos } from "./money";
import { findOversold } from "./oversold";
import { findUnit } from "./products";

// The fixed reason set for a pull-out. Lives here — not in pullouts.ts — so
// both `pullouts.create` and `stockMovements.editEntry` (which patches the
// same field on the same rows) validate against the one set rather than two
// that could drift apart.
export const reasonCategory = v.union(
  v.literal("damaged"),
  v.literal("expired"),
  v.literal("personal use"),
  v.literal("given away"),
  v.literal("other"),
);

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
  // The Unit this movement was entered in — must name one of the product's
  // `units`. `recordMovement` resolves it to find the Base equivalent to
  // snapshot, so no caller has to look that up itself.
  unitLabel: string;
  /** How many of that Unit moved — a magnitude, never signed. */
  unitQuantity: number;
};

/**
 * The Base amount a row's snapshot comes to — never stored, derived on every
 * read (docs/adr/0003-base-unit-storage.md). Rounded so the float noise from
 * a decimal Unit quantity (`1.7 * 1000` !== `1700`) never re-enters
 * `quantityOnHand`, which is written back rather than recomputed each time.
 */
export function deriveBaseAmount(m: {
  unitQuantity: number;
  baseEquivalentAtEntry: number;
}): number {
  return Math.round(m.unitQuantity * m.baseEquivalentAtEntry);
}

/**
 * Write one movement and move the product's cached count with it. The two
 * halves are the invariant the whole feature exists to protect, so no caller
 * gets to do one without the other.
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

  const alreadyExplained = movements.reduce(
    (sum, m) => sum + deriveBaseAmount(m),
    0,
  );

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
    unitLabel: product.baseUnitLabel,
    unitQuantity: product.quantityOnHand - alreadyExplained,
    baseEquivalentAtEntry: 1,
    createdAt: movements.length > 0 ? earliestExisting - 1 : earliestExisting,
  });
  return true;
}

/**
 * What a sale charged, derived from its ledger rows rather than stored. Sale
 * quantities are negative, so the line amounts are subtracted to land back on
 * a positive total. Each line rounds to centavos before it joins the sum, so
 * a receipt's printed lines visibly add up to its printed total.
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

    // Balances are folded synchronously, before any of the `await`s below —
    // those run concurrently over the whole array, and a shared counter
    // mutated inside an async callback would race against them, each row
    // reading whatever the counter had reached by the time its own lookup
    // resolved rather than the value at its own turn.
    let runningBalance = 0;
    const balances = oldestFirst.map(
      (m) => (runningBalance += deriveBaseAmount(m)),
    );

    const rows = await Promise.all(
      oldestFirst.map(async (m, i) => {
        // A delivery row's supplier lives on the `deliveries` header, not on
        // the movement itself — `ctx.db.get` on both hops bypasses lifecycle
        // filtering the same way `sales.list`'s customer join does, so an
        // archived or deleted supplier's name still renders here.
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
          // Undefined for `opening` rows, which have no header entry to open —
          // the ledger row itself is the whole story for those.
          refId: m.refId,
          createdAt: m.createdAt,
          // Base-denominated, signed — what the running balance is folded
          // from. `unitLabel`/`unitQuantity` below are what the row reads
          // back as ("2 trays"), which is not the same figure once the Unit
          // isn't the Base unit.
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
 * Every line a header row (delivery, pull-out, or sale) carries, each joined
 * to the product name at the time of reading and holding the `movementId`
 * that identifies it for an edit — the one shape `deliveries.list`,
 * `pullouts.list`, `sales.list`, and `editEntry`'s prefill all read lines
 * through, rather than each re-deriving it from `stockMovements` by hand.
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
        // Signed, in the Unit the line was actually entered in — what lets a
        // sale read back as "2 trays" rather than "60 pieces". Never called
        // `quantity` on its own (see CONTEXT.md's Unit-quantity glossary
        // entry): every other fold over the ledger has to work in Base
        // amounts, so `baseAmount` is derived here too rather than making
        // each caller re-derive it from `unitLabel`/`unitQuantity` by hand.
        unitLabel: m.unitLabel,
        unitQuantity: m.unitQuantity,
        baseAmount: deriveBaseAmount(m),
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
 * One entry's lines and (for a pull-out) its reason — what the edit sheet
 * prefills from when it is opened by `refId` alone, which is all a tap on a
 * product ledger row carries. The Movements tab already holds the fuller
 * entry object from its own list query and doesn't need this, but routing
 * both openers through the same fetch keeps the sheet's prefill logic single
 * rather than branching on where the tap came from.
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
 * A correction to an existing delivery or pull-out: the caller sends the
 * *full* desired line set — some carrying the `movementId` of a row they
 * still describe, some new — and this diffs it against what is actually on
 * the entry today. A line whose `movementId` survives with a changed
 * quantity is patched by the difference; one that disappears is deleted and
 * its delta reversed; a line with no `movementId` is a fresh insert. Sale
 * entries are rejected outright — they are edited from the Register, not
 * here — and the negative-stock warning is the identical one `sales.create`
 * and `pullouts.create` carry, just judged against the entry's *net* effect
 * per product rather than line by line, since one entry can touch the same
 * product on more than one line.
 */
export const editEntry = mutation({
  args: {
    entry: entryRef,
    lines: v.array(
      v.object({
        movementId: v.optional(v.id("stockMovements")),
        productId: v.id("products"),
        quantity: v.number(),
      }),
    ),
    reasonCategory: v.optional(reasonCategory),
    reasonNotes: v.optional(v.string()),
    // Delivery-only, mirroring `customers.update`'s notes trap: omitted
    // leaves the delivery's supplier untouched, `null` clears it back to
    // none, an id changes it. Ignored for a pull-out.
    supplierId: v.optional(v.union(v.id("suppliers"), v.null())),
    // Same backstop as create's allowNegative: the warning is computed
    // client-side, so this flag is the record that a human saw it and said
    // yes. One flag for the whole edit, not one per line.
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
    // An entry with no rows at all isn't a mismatch the check below would
    // catch — that check is vacuously true over an empty list — so a bogus
    // `entryId` paired with an all-new line set would otherwise sail through
    // and silently create movements against an id nothing else points to.
    if (existing.length === 0) {
      throw new Error(`Entry ${entry.entryId} does not exist`);
    }
    // `by_refId` can only ever hold rows of one type for a given id, but this
    // mutation is handed `entry.type` by the caller rather than trusting the
    // rows — a mismatch here means the sheet opened the wrong kind of entry.
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
      referencedIds.add(line.movementId);
    }

    // Project every line's contribution to each product's net delta before
    // writing anything, so the negative-stock check sees the whole entry —
    // including a product touched by two lines, or a line dropped alongside
    // one raised — the way the diff will actually leave it, not line by line.
    const deltaLines: { productId: Id<"products">; delta: number }[] = [];
    for (const line of lines) {
      const newSigned = DIRECTION[entry.type] * line.quantity;
      if (line.movementId) {
        const movement = existingById.get(line.movementId);
        if (movement) {
          deltaLines.push({
            productId: line.productId,
            delta: newSigned - deriveBaseAmount(movement),
          });
        }
      } else {
        deltaLines.push({ productId: line.productId, delta: newSigned });
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
      // Checked one product at a time, in the order it was first touched, so a
      // product missing further down the entry can't shadow an earlier one's
      // oversold error with the wrong message.
      const touchedProductIds = [
        ...new Set(deltaLines.map((l) => l.productId)),
      ];
      for (const productId of touchedProductIds) {
        const product = await ctx.db.get(productId);
        if (!product) throw new Error("Product not found");
        const oversold = findOversold(
          deltaLines.filter((l) => l.productId === productId),
          [{ productId: product._id, quantityOnHand: product.quantityOnHand }],
        );
        if (oversold.length > 0) {
          throw new Error(
            `This edit would leave "${product.name}" at ${oversold[0].projected}. ` +
              `Confirm the count is wrong and record it anyway to proceed.`,
          );
        }
      }
    }

    // Dropped lines: reverse their delta and delete the row.
    for (const movement of existing) {
      if (referencedIds.has(movement._id)) continue;
      const product = await ctx.db.get(movement.productId);
      if (!product) throw new Error("Product not found");
      await ctx.db.patch(movement.productId, {
        quantityOnHand: product.quantityOnHand - deriveBaseAmount(movement),
      });
      await ctx.db.delete(movement._id);
    }

    // Existing lines that survive: patch the quantity (a no-op delta when
    // unchanged) and, for a pull-out, the reason — which lives once per entry
    // but is stored on every row, so a reason edit has to reach all of them.
    // Delivery and pull-out lines ride the product's Base unit throughout, so
    // the stored `unitQuantity` is patched straight to the new signed amount
    // — `baseEquivalentAtEntry` (already 1) never needs touching.
    for (const line of lines) {
      if (!line.movementId) continue;
      const movement = existingById.get(line.movementId);
      if (!movement) continue;
      const newSigned = DIRECTION[entry.type] * line.quantity;
      const diff = newSigned - deriveBaseAmount(movement);
      if (diff !== 0) {
        const product = await ctx.db.get(line.productId);
        if (!product) throw new Error("Product not found");
        await ctx.db.patch(line.productId, {
          quantityOnHand: product.quantityOnHand + diff,
        });
      }
      await ctx.db.patch(movement._id, {
        unitQuantity: newSigned,
        ...(entry.type === "pullout" ? { reasonCategory, reasonNotes } : {}),
      });
    }

    // New lines: insert and move stock, same as a fresh entry. Both entry
    // types ride the product's Base unit (their own Unit pickers arrive in
    // later tickets), so the Unit is always the product's own.
    for (const line of lines) {
      if (line.movementId) continue;
      const product = await ctx.db.get(line.productId);
      if (!product) throw new Error("Product not found");
      if (entry.type === "pullout") {
        await recordMovement(ctx, {
          type: "pullout",
          refId: entry.entryId,
          productId: line.productId,
          unitLabel: product.baseUnitLabel,
          unitQuantity: line.quantity,
          reasonCategory: reasonCategory as string,
          reasonNotes,
        });
      } else {
        await recordMovement(ctx, {
          type: "delivery",
          refId: entry.entryId,
          productId: line.productId,
          unitLabel: product.baseUnitLabel,
          unitQuantity: line.quantity,
        });
      }
    }
  },
});

/**
 * Taking back an entry that should never have existed: every line under the
 * header reverses its own signed delta, then the header itself goes. Sale
 * entries are rejected outright, same as `editEntry` — they are corrected
 * from the Register, not here. The negative-stock warning is judged the same
 * way `editEntry`'s is — against the entry's net effect per product, since
 * one entry can touch the same product on more than one line — except every
 * existing movement is reversed rather than diffed against a new line set.
 */
export const deleteEntry = mutation({
  args: {
    entry: entryRef,
    // Same backstop as editEntry's: the warning is computed client-side, so
    // this flag is the record that a human saw it and said yes.
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
    // Same guard as editEntry's: an entry with no rows at all isn't something
    // the create mutations ever produce, but a bogus `entryId` should still
    // be refused rather than silently deleting a header nothing points to.
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
      // Checked one product at a time, in the order it was first touched, so a
      // product missing further down the entry can't shadow an earlier one's
      // oversold error with the wrong message.
      const touchedProductIds = [
        ...new Set(deltaLines.map((l) => l.productId)),
      ];
      for (const productId of touchedProductIds) {
        const product = await ctx.db.get(productId);
        if (!product) throw new Error("Product not found");
        const oversold = findOversold(
          deltaLines.filter((l) => l.productId === productId),
          [{ productId: product._id, quantityOnHand: product.quantityOnHand }],
        );
        if (oversold.length > 0) {
          throw new Error(
            `Deleting this entry would leave "${product.name}" at ${oversold[0].projected}. ` +
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
