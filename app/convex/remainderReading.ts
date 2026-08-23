/**
 * How a stock figure reads on screen. It reads either as the plain Base-unit
 * amount, or as that amount spelled out against a Reading ladder. The ladder is
 * a per-product opt-in. Each Denomination on it takes a whole count in turn,
 * and what is left over falls to the next. A figure then reads "3 cases, 5 pcs"
 * instead of "1085 pcs".
 *
 * Three rules govern the ladder, and `buildReadingLadder` holds all three:
 *
 *   1. The ladder sorts by descending Base equivalent. It does not keep the
 *      order somebody ticked the boxes in.
 *   2. The read is greedy. Each Denomination takes its whole count, and the
 *      remainder falls through.
 *   3. The Base unit is always the final Denomination. The builder appends it
 *      whether or not somebody selected it. Without it, a remainder finer than
 *      the lowest selected Denomination has nowhere to go. The reading then
 *      understates the shelf, and nothing on screen shows it. Rice on a
 *      `[sako, kilo]` ladder would drop the trailing 400 g.
 *
 * Denominations need not divide into each other. A greedy read stays
 * arithmetically exact either way, because each Denomination takes only its
 * whole count. Onions on `[sack of 100, bundle of 12]` read 437 as "4 sacks, 3
 * bundles, 1 pc". The terms add back to exactly 437.
 * What non-nesting Denominations cost is readability. A bundle count climbs to
 * 8 without ever rolling into a sack. This repo accepts that cost and does not
 * refuse the ladder.
 *
 * unitLabels.ts inflects each term's label to agree with its own count, as in
 * "1 tray, 5 pcs". Every other screen that shows a count beside a label goes
 * through unitLabels.ts too.
 *
 * A reading must never break a screen. A ladder that no longer makes sense
 * therefore degrades to a shorter ladder, and does not throw. See the
 * rejections in `buildReadingLadder`.
 *
 * Nothing here touches how the app holds a quantity. `quantityOnHand` and every
 * Ledger row stay Base-unit numbers. See docs/adr/0003-base-unit-storage.md.
 * This module only decides how a figure reads back.
 * See "Remainder reading" and "Reading ladder" in CONTEXT.md.
 */

import { formatCount } from "./unitLabels";

export type Unit = { label: string; baseEquivalent: number };

/** One Denomination's contribution to a reading. "3 cases" is `3` and `"case"`. */
export type ReadingTerm = { count: number; unitLabel: string };

/**
 * A figure read against a ladder, one term per Denomination and in ladder
 * order. A Denomination that counts zero is still present here.
 * `formatReading` is what decides it is not spoken, so a caller that wants the
 * whole decomposition still gets it.
 */
export type QuantityReading = ReadingTerm[];

type LadderInput = {
  units: Unit[];
  baseUnitLabel: string;
  denominationLabels?: string[];
};

/** A Base equivalent that a reading can divide by. */
function isUsable(baseEquivalent: number) {
  return Number.isFinite(baseEquivalent) && baseEquivalent > 0;
}

/**
 * The Base unit as a Denomination. It is the one Denomination fine enough to
 * hold whatever the coarser ones leave behind. Without a final Denomination
 * there is no reading to give. This function therefore stands one in when the
 * label names no Unit.
 * `validateUnits` pins a real Base unit at 1. The stand-in here serves a
 * product read while its Units are mid-edit.
 */
function resolveBaseUnit({
  units,
  baseUnitLabel,
}: {
  units: Unit[];
  baseUnitLabel: string;
}): Unit {
  const declared = units.find((u) => u.label === baseUnitLabel);
  return declared && isUsable(declared.baseEquivalent)
    ? declared
    : { label: baseUnitLabel, baseEquivalent: 1 };
}

/**
 * The Units that a product's ladder can hold. They are everything coarser than
 * its Base unit, coarsest first, one per label.
 * This function is exported so the product form offers exactly the boxes
 * `buildReadingLadder` honours. The two must never disagree. A form that offers
 * a Denomination the reading drops shows nothing about the drop.
 *
 * This list is deliberately not deduped by Base equivalent, unlike the ladder
 * itself. Two same-sized Units are two real Units, and a person can tick both.
 * The reading decides which of them wins, and the form previews the result.
 *
 * The function is generic over the row, and it hands back the very rows it was
 * given rather than copies. The add-product form tracks its ticks by draft-row
 * key and not by label. A label somebody is typing can be blank or briefly
 * duplicated. Those keys must survive the trip.
 */
export function selectableDenominations<T extends Unit>(product: {
  units: T[];
  baseUnitLabel: string;
}): T[] {
  const baseUnit = resolveBaseUnit(product);
  return product.units
    .filter(
      (unit, i) =>
        unit.label.length > 0 &&
        isUsable(unit.baseEquivalent) &&
        unit.baseEquivalent > baseUnit.baseEquivalent &&
        product.units.findIndex((other) => other.label === unit.label) === i,
    )
    .sort((a, b) => b.baseEquivalent - a.baseEquivalent);
}

/**
 * The Units a product's stock is spelled out in, coarsest first and always
 * ending at its Base unit.
 * An absent or empty selection yields the Base unit alone. That ladder of one
 * Denomination reads as the plain Base-unit figure. The plain reading is
 * therefore the degenerate case here, and not a separate branch.
 *
 * The builder drops three kinds of selection, and refuses none of them. A stale
 * ladder must not take a screen down with it. The three are:
 *
 *   - A label whose Unit the product no longer holds. `defaultUnitLabel` takes
 *     the same posture.
 *   - A second Unit that shares a Base equivalent with one already on the
 *     ladder. It would read 0 forever, because the first one took everything.
 *   - A selection no coarser than the Base unit. It has nothing to decompose
 *     into.
 */
export function buildReadingLadder(product: LadderInput): Unit[] {
  const { units, denominationLabels } = product;
  const baseUnit = resolveBaseUnit(product);

  const denominations: Unit[] = [];
  const taken = new Set<number>([baseUnit.baseEquivalent]);
  const resolved = (denominationLabels ?? [])
    .map((label) => units.find((u) => u.label === label))
    .filter((unit): unit is Unit => unit !== undefined)
    // The builder does not trust the selection order. This sort is what makes
    // the greedy read below take the coarsest Denomination first.
    .sort((a, b) => b.baseEquivalent - a.baseEquivalent);

  for (const unit of resolved) {
    if (!isUsable(unit.baseEquivalent)) continue;
    if (unit.baseEquivalent <= baseUnit.baseEquivalent) continue;
    if (taken.has(unit.baseEquivalent)) continue;
    taken.add(unit.baseEquivalent);
    denominations.push(unit);
  }

  return [...denominations, baseUnit];
}

/**
 * This function reads a Base-unit figure down a ladder, greedily. Every
 * Denomination gets a
 * term, zero or not. The final Denomination takes the whole remaining amount
 * and not its whole count. The terms therefore sum back to `quantityOnHand`
 * exactly, including when the figure carries a fraction the Base unit holds.
 */
export function readQuantity(
  quantityOnHand: number,
  ladder: Unit[],
): QuantityReading {
  // This function is exported independently of `buildReadingLadder`, which is
  // the only thing that guarantees a final Denomination. An empty ladder
  // therefore reads as nothing, and does not index off the end of itself.
  if (ladder.length === 0) return [];
  const finest = ladder[ladder.length - 1];

  // A negative count is the Ledger disagreeing with the shelf. It is a recount
  // signal and not a shelf quantity, so a spelling in cases and trays would
  // mean nothing.
  if (quantityOnHand < 0) {
    // The division here matches the positive branch's final term. The two
    // therefore agree on the stand-in path, where the finest Denomination is
    // not a Base equivalent of 1. A product read mid-edit takes that path. See
    // `resolveBaseUnit`.
    return [
      {
        count: quantityOnHand / finest.baseEquivalent,
        unitLabel: finest.label,
      },
    ];
  }

  const terms: ReadingTerm[] = [];
  let remaining = quantityOnHand;
  for (let i = 0; i < ladder.length - 1; i++) {
    const denomination = ladder[i];
    const count = Math.floor(remaining / denomination.baseEquivalent);
    remaining -= count * denomination.baseEquivalent;
    terms.push({ count, unitLabel: denomination.label });
  }
  terms.push({
    count: remaining / finest.baseEquivalent,
    unitLabel: finest.label,
  });
  return terms;
}

/**
 * This function speaks a reading. A Denomination that comes to zero drops out,
 * and nothing
 * pads it. A figure reads "3 cases, 5 pcs" and never "3 cases, 0 trays, 5 pcs".
 * A figure where every Denomination is zero falls back to "0 «base unit»".
 * To drop them all would leave nothing on the screen.
 *
 * Each term goes through `formatCount`, so its label agrees with its own count.
 * A reading gives "1 tray, 5 pcs" and not "1 trays, 5 pcs". These readings
 * therefore word their labels the same way the Register and the movement sheets
 * do. See unitLabels.ts.
 */
export function formatReading(reading: QuantityReading): string {
  const spoken = reading.filter((term) => term.count !== 0);
  if (spoken.length === 0) {
    // Every Denomination came to zero, or the ladder held none at all. To drop
    // them all would leave the screen blank, so the finest one speaks its zero.
    const finest = reading[reading.length - 1];
    return finest ? formatCount(0, finest.unitLabel) : "";
  }
  return spoken
    .map((term) => formatCount(term.count, term.unitLabel))
    .join(", ");
}

/**
 * `buildReadingLadder`, `readQuantity`, and `formatReading` in one call. Every
 * caller pulls the same fields off a product and formats the result at once.
 * This one call therefore stands in place of six copies of the trio.
 * The callers include the products list, the Register grid, and the product
 * detail page. The on-hand and projection hints on both movement sheets are
 * callers. So is the delete gate in `products.remove`.
 * The product Ledger's running balance column calls the trio directly. It
 * builds the ladder once and reads every row's balance against it, so one
 * `formatStock` call per row would rebuild the same ladder.
 */
export function formatStock(
  product: LadderInput & { quantityOnHand: number },
): string {
  return formatReading(
    readQuantity(product.quantityOnHand, buildReadingLadder(product)),
  );
}
