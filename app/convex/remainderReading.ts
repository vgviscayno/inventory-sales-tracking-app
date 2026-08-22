/**
 * How a stock figure reads on screen — either the plain Base-unit amount, or
 * (opt in, per product) that amount spelled out against a **Reading ladder**:
 * a whole count of each Unit on the ladder in turn, with what is left over
 * falling to the next. "3 cases, 5 pcs" rather than "1085 pcs".
 *
 * Three rules govern the ladder, and they live in `buildReadingLadder`:
 *
 *   1. It is sorted by descending Base equivalent, not by the order the boxes
 *      happened to be ticked in.
 *   2. It is read greedily — each denomination takes its whole count, the remainder
 *      falls through.
 *   3. The Base unit is always the final denomination, appended whether or not it was
 *      selected. Without it a remainder finer than the lowest selected denomination
 *      has nowhere to go and the reading silently *understates the shelf* —
 *      rice on a `[sako, kilo]` ladder would drop the trailing 400 g.
 *
 * Denominations are not required to divide into each other. A greedy read stays
 * arithmetically exact either way, because each denomination takes only its whole
 * count: onions on `[sack of 100, bundle of 12]` read 437 as "4 sacks, 3
 * bundles, 1 pc", and the terms add back to exactly 437. What non-nesting
 * denominations cost is readability — a bundle count can climb to 8 without ever
 * rolling into a sack — and that cost is accepted rather than refused.
 *
 * Each term's label is inflected to agree with its own count — "1 tray, 5
 * pcs" — by unitLabels.ts, which every other screen showing a count beside a
 * label goes through too.
 *
 * A reading must never be the thing that breaks a screen, so a ladder that no
 * longer makes sense degrades to a shorter one rather than throwing. See the
 * rejections in `buildReadingLadder`.
 *
 * This never touches how a quantity is held — `quantityOnHand` and every
 * ledger row stay Base-unit numbers regardless
 * (docs/adr/0003-base-unit-storage.md) — it only decides how one is read back.
 * See CONTEXT.md's "Remainder reading" and "Reading ladder".
 */

import { formatCount } from "./unitLabels";

export type Unit = { label: string; baseEquivalent: number };

/** One denomination's contribution to a reading — "3 cases" is `3` and `"case"`. */
export type ReadingTerm = { count: number; unitLabel: string };

/**
 * A figure read against a ladder, one term per denomination and in ladder order.
 * Zero-counting denominations are still present here — `formatReading` is what
 * decides they aren't spoken, so a caller that wants the full decomposition
 * can still have it.
 */
export type QuantityReading = ReadingTerm[];

type LadderInput = {
  units: Unit[];
  baseUnitLabel: string;
  denominationLabels?: string[];
};

/** A Base equivalent that can actually be divided by. */
function isUsable(baseEquivalent: number) {
  return Number.isFinite(baseEquivalent) && baseEquivalent > 0;
}

/**
 * The Base unit as a denomination. It is the one denomination fine enough to hold whatever
 * the coarser ones leave behind, so it is stood in when its label names no
 * Unit — there is no reading to give without a final denomination. (`validateUnits`
 * pins a real Base unit at 1; this is for a product read while its Units are
 * mid-edit, and for the stand-in itself.)
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
 * The Units that can be put on a product's ladder: everything coarser than
 * its Base unit, coarsest first, one per label. Exported so the product form
 * offers exactly the boxes `buildReadingLadder` would honour — the two must
 * never disagree, or the form offers a denomination the reading silently drops.
 *
 * Deliberately *not* deduped by Base equivalent, unlike the ladder itself: two
 * same-sized Units are two real Units and both are tickable. Which of them
 * wins is the reading's call, and the form previews the result.
 */
export function selectableDenominations(product: {
  units: Unit[];
  baseUnitLabel: string;
}): Unit[] {
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
 * ending at its Base unit. An absent or empty selection yields just the Base
 * unit — a ladder of one Denomination, which reads as the plain Base-unit
 * figure, so the
 * plain reading is the degenerate case of this rather than a separate branch.
 *
 * Three selections are dropped rather than refused, since a stale ladder must
 * not take a screen down with it:
 *
 *   - a label whose Unit has since been deleted from the product (the same
 *     posture `defaultUnitLabel` takes);
 *   - a second Unit sharing a Base equivalent with one already on the ladder,
 *     which would read 0 forever because the first one took everything;
 *   - a selection no coarser than the Base unit, which has nothing to
 *     decompose into.
 */
export function buildReadingLadder(product: LadderInput): Unit[] {
  const { units, denominationLabels } = product;
  const baseUnit = resolveBaseUnit(product);

  const denominations: Unit[] = [];
  const taken = new Set<number>([baseUnit.baseEquivalent]);
  const resolved = (denominationLabels ?? [])
    .map((label) => units.find((u) => u.label === label))
    .filter((unit): unit is Unit => unit !== undefined)
    // Selection order is not trusted: sorting here is what makes the greedy
    // read below take the coarsest denomination first.
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
 * Reads a Base-unit figure down a ladder, greedily. Every denomination gets a term,
 * zero or not, and the final denomination takes the whole remaining amount rather
 * than its whole count — so the terms always sum back to `quantityOnHand`
 * exactly, including when the figure carries a fraction the Base unit can
 * hold.
 */
export function readQuantity(
  quantityOnHand: number,
  ladder: Unit[],
): QuantityReading {
  // Exported independently of `buildReadingLadder`, which is the only thing
  // guaranteeing a final denomination — so an empty ladder reads as nothing rather
  // than indexing off the end of it.
  if (ladder.length === 0) return [];
  const finest = ladder[ladder.length - 1];

  // A negative count is the ledger disagreeing with the shelf — a recount
  // signal, not a shelf quantity — so spelling it out in cases and trays
  // wouldn't mean anything.
  if (quantityOnHand < 0) {
    // Divided the same way the positive branch's final term is, so the two
    // agree on the stand-in path where the finest denomination isn't a Base
    // equivalent of 1 (a product read mid-edit — see `resolveBaseUnit`).
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
 * Speaks a reading. A denomination that comes to zero is dropped rather than padded
 * out — "3 cases, 5 pcs", never "3 cases, 0 trays, 5 pcs" — and a figure
 * where every denomination is zero falls back to "0 «base unit»", since dropping them
 * all would leave nothing on the screen at all.
 *
 * Each term goes through `formatCount` so its label agrees with its own count
 * — "1 tray, 5 pcs", not "1 trays, 5 pcs" — and so these readings word their
 * labels the same way the Register and the movement sheets do (unitLabels.ts).
 */
export function formatReading(reading: QuantityReading): string {
  const spoken = reading.filter((term) => term.count !== 0);
  if (spoken.length === 0) {
    // Every denomination came to zero (or there were none at all): dropping them all
    // would leave the screen blank, so the finest one speaks its zero.
    const finest = reading[reading.length - 1];
    return finest ? formatCount(0, finest.unitLabel) : "";
  }
  return spoken
    .map((term) => formatCount(term.count, term.unitLabel))
    .join(", ");
}

/**
 * `buildReadingLadder` + `readQuantity` + `formatReading` in one call — every
 * caller (the products list, the Register grid, the product detail page, both
 * movement sheets' on-hand hints, the delete gate) pulls the same fields off a
 * product and immediately formats the result, so this is that one call rather
 * than six copies of the trio.
 */
export function formatStock(
  product: LadderInput & { quantityOnHand: number },
): string {
  return formatReading(
    readQuantity(product.quantityOnHand, buildReadingLadder(product)),
  );
}
