/**
 * The draft of a product a Delivery Line creates, and the rules the sheet
 * judges it by.
 *
 * The Delivery sheet takes a product the catalog does not hold yet on a step
 * of its own. Everything that step collects lives in this shape, as text,
 * because text is what somebody types. The module turns that text into the
 * `kind: "new"` Line `deliveries.create` takes.
 *
 * The rules here mirror the ones the mutation holds. The client refuses what
 * the server refuses, so a save cannot reach the server to be told no. The
 * server stays the guarantee. See `convex/deliveries.ts`.
 */

/**
 * A product under declaration. `unitLabel` names its Base unit, and `price` is
 * what one of that Unit sells for.
 *
 * The four `extra` fields are one optional Unit beside the Base unit. Stock is
 * held in the Base unit, and a shipment does not arrive in it. A product based
 * in the piece still has to be received as "10 trays".
 * `extraUnitOpen` is what every rule below reads, and not the emptiness of the
 * three fields under it. A block somebody opens and leaves blank is an
 * unfinished Unit, and it holds the save. An emptiness test would call it an
 * absent Unit and let the save through.
 *
 * `recordIn` names which of the two Units `quantity` counts. See `countedIn`.
 */
export type NewProductDraft = {
  name: string;
  unitLabel: string;
  price: string;
  quantity: number;
  extraUnitOpen: boolean;
  extraLabel: string;
  extraEquivalent: string;
  extraPrice: string;
  recordIn: "base" | "extra";
};

/** A draft as the step opens it, on whatever name the search box held. */
export function emptyDraft(name: string): NewProductDraft {
  return {
    name,
    unitLabel: "",
    price: "",
    quantity: 1,
    extraUnitOpen: false,
    extraLabel: "",
    extraEquivalent: "",
    extraPrice: "",
    recordIn: "base",
  };
}

/**
 * The price a second Unit carries, or `undefined` where the box is blank. A
 * blank box is a Unit with no price of its own. A typed zero is a price, and
 * the server refuses it.
 */
export function extraUnitPrice(draft: NewProductDraft) {
  return draft.extraPrice.trim() === "" ? undefined : Number(draft.extraPrice);
}

/**
 * A second Unit that names a label and says what it comes to in Base units.
 * The Base equivalent must be a whole positive number, and a price the
 * shopkeeper types must be positive. `validateUnits` in convex/products.ts
 * holds both rules, so a complete Unit here is one the server accepts.
 */
export function extraUnitComplete(draft: NewProductDraft) {
  const baseEquivalent = Number(draft.extraEquivalent);
  const price = extraUnitPrice(draft);
  return (
    draft.extraUnitOpen &&
    draft.extraLabel.trim().length > 0 &&
    Number.isInteger(baseEquivalent) &&
    baseEquivalent > 0 &&
    (price === undefined || price > 0)
  );
}

/**
 * Everything the product needs before the Delivery it arrives on can save. A
 * product with no name cannot be added, and neither can one with no Base unit
 * or no price.
 */
export function isComplete(draft: NewProductDraft) {
  return (
    draft.name.trim().length > 0 &&
    draft.unitLabel.trim().length > 0 &&
    Number(draft.price) > 0 &&
    (!draft.extraUnitOpen || extraUnitComplete(draft))
  );
}

/**
 * The Unit this Line's count is read in. It is the second Unit where the draft
 * has a finished one and records in it, and the Base unit otherwise.
 * The step and the collapsed Line both read the count through this function.
 * The Line therefore cannot say "10 trays" where the step said "10 pieces".
 */
export function countedIn(draft: NewProductDraft) {
  return draft.recordIn === "extra" && extraUnitComplete(draft)
    ? draft.extraLabel.trim()
    : draft.unitLabel.trim();
}

/**
 * The Line `deliveries.create` takes. An unfinished second Unit never reaches
 * it, and an empty price box means the Unit has no price of its own. The
 * server prices such a Unit from the Base unit.
 */
export function toCreateLine(draft: NewProductDraft) {
  return {
    kind: "new" as const,
    name: draft.name.trim(),
    unitLabel: draft.unitLabel.trim(),
    price: Number(draft.price),
    extraUnits: extraUnitComplete(draft)
      ? [
          {
            label: draft.extraLabel.trim(),
            baseEquivalent: Number(draft.extraEquivalent),
            price: extraUnitPrice(draft),
          },
        ]
      : undefined,
    quantityUnitLabel: countedIn(draft),
    quantity: draft.quantity,
  };
}
