import { type Infer, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { roundCentavos } from "./money";
import { resolveDefaultUnitLabel, validateUnits } from "./products";
import { unitValidator } from "./schema";
import { entryLines, recordMovement } from "./stockMovements";

// One Unit a Line declares beside its Base unit. It is the schema's own Unit
// with the price made optional. A new field on a Unit therefore still needs
// one declaration. See `unitValidator` in schema.ts and `newProductUnits`.
const declaredUnitValidator = unitValidator
  .omit("price")
  .extend({ price: v.optional(v.number()) });

/**
 * The Units a `kind: "new"` Line's product is born with. The Base unit comes
 * first, then whatever Units the Line declares beside it.
 * A second Unit's price is optional on the Line and required on the product.
 * The Base unit's price therefore stands in, at that Unit's Base equivalent.
 * A piece at 8 makes a tray of 30 come to 240.
 * The shopkeeper gets the arithmetic she would have done. She does not get a
 * Unit the product form later refuses to save. The step shows her the figure.
 * The build and the validation live here, so the check before the write and
 * the write itself read the same Unit list.
 */
function newProductUnits(line: {
  unitLabel: string;
  price: number;
  extraUnits?: Infer<typeof declaredUnitValidator>[];
}) {
  return [
    { label: line.unitLabel.trim(), baseEquivalent: 1, price: line.price },
    ...(line.extraUnits ?? []).map((u) => ({
      label: u.label.trim(),
      baseEquivalent: u.baseEquivalent,
      price: u.price ?? roundCentavos(line.price * u.baseEquivalent),
    })),
  ];
}

export const create = mutation({
  args: {
    // A Line either names a product that already exists, or carries what a new
    // product needs. The `kind` literal makes that a type the handler switches
    // on. Without it the args would carry a `productId` beside a new-product
    // object. The handler would then reject the both-or-neither states by hand.
    lines: v.array(
      v.union(
        v.object({
          kind: v.literal("existing"),
          productId: v.id("products"),
          // The Unit this Line's quantity is entered in. An omitted value
          // falls back to the product's Default unit. See
          // `resolveDefaultUnitLabel`.
          // A caller that does not care about Units therefore still lands on
          // the Base unit. A single-Unit product always defaults to it. Most
          // existing tests and the "new" Line's own creation path are such
          // callers.
          unitLabel: v.optional(v.string()),
          quantity: v.number(),
        }),
        v.object({
          kind: v.literal("new"),
          name: v.string(),
          // The Unit this quick-created product is based in. Nothing offers a
          // default here either. A plausible default is how a product ends up
          // based in the wrong Unit. See
          // docs/adr/0004-base-unit-locked.md.
          unitLabel: v.string(),
          price: v.number(),
          // The Units the product carries beside its Base unit. A shipment
          // arrives in bulk, so a product based in the piece is still received
          // as "10 trays". The Line that creates it therefore declares the
          // tray here, and names it below.
          // Each price is optional. See `newProductUnits`.
          extraUnits: v.optional(v.array(declaredUnitValidator)),
          // Which of this product's Units the `quantity` below counts. It must
          // name the Base unit or one of `extraUnits`. An omitted value counts
          // the Base unit, which is what a single-Unit Line means.
          quantityUnitLabel: v.optional(v.string()),
          quantity: v.number(),
        }),
      ),
    ),
    // Optional. The shop still records stock it bought retail or received as a
    // gift. It also records stock from somebody it does not name.
    supplierId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, { lines, supplierId }) => {
    if (lines.length === 0) {
      throw new Error("A delivery must have at least one line");
    }
    for (const line of lines) {
      if (line.quantity <= 0) {
        throw new Error("Each delivery line must have a positive quantity");
      }
      if (line.kind === "new") {
        if (!line.name.trim()) {
          throw new Error("A new product needs a name");
        }
        if (!line.unitLabel.trim()) {
          throw new Error("A new product needs a Base unit");
        }
        if (line.price <= 0) {
          throw new Error("A new product needs a positive price");
        }
        // The rest of the Unit rules hold here: a label on every Unit, no two
        // Units on one label, and a whole positive Base equivalent. A second
        // Unit that repeats the Base unit's label is the one this catches most
        // often.
        validateUnits(newProductUnits(line), line.unitLabel.trim());
      }
    }

    const deliveryId = await ctx.db.insert("deliveries", {
      createdAt: Date.now(),
      supplierId,
    });

    // One `recordMovement` call per Line, even when two Lines name the same
    // product. Each Line is its own arrival on its own row. The handler never
    // merges two Unit quantities before they reach the Ledger.
    // The handler creates a Line's product here, inside the same mutation as
    // the Delivery it arrived on. The two therefore land together, or on any
    // failure neither lands.
    for (const line of lines) {
      let productId: Id<"products">;
      let unitLabel: string;
      if (line.kind === "existing") {
        productId = line.productId;
        const product = await ctx.db.get(productId);
        if (!product) throw new Error("Product not found");
        unitLabel = line.unitLabel ?? resolveDefaultUnitLabel(product);
      } else {
        const units = newProductUnits(line);
        const baseUnitLabel = line.unitLabel.trim();
        productId = await ctx.db.insert("products", {
          name: line.name.trim(),
          units,
          baseUnitLabel,
          quantityOnHand: 0,
        });
        // `recordMovement` resolves this label against the Units above, and
        // refuses one that names none of them. No check here repeats that.
        unitLabel = line.quantityUnitLabel?.trim() || baseUnitLabel;
      }
      await recordMovement(ctx, {
        type: "delivery",
        refId: deliveryId,
        productId,
        unitLabel,
        unitQuantity: line.quantity,
      });
    }

    return deliveryId;
  },
});

/**
 * Deliveries newest first. Each Delivery carries its Lines and the net change
 * the whole Entry carried. Each Line joins to the product name at the moment of
 * the read. The Movements tab renders one row per Delivery from this shape.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const deliveries = await ctx.db.query("deliveries").order("desc").collect();

    return await Promise.all(
      deliveries.map(async (delivery) => {
        const lines = await entryLines(ctx, delivery._id);
        return {
          _id: delivery._id,
          createdAt: delivery.createdAt,
          lines,
          netChange: lines.reduce((sum, l) => sum + l.baseAmount, 0),
        };
      }),
    );
  },
});
