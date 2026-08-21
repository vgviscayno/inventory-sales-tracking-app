/**
 * How a stock figure reads on screen — either the plain Base-unit amount, or
 * (opt in, per product) that amount decomposed against the Default unit into
 * a whole count of it plus what's left over in Base units: "10 trays, 5 pcs"
 * rather than "305 pcs". See CONTEXT.md's "Remainder reading".
 *
 * This never touches how a quantity is held — `quantityOnHand` and every
 * ledger row stay Base-unit integers regardless (docs/adr/0003-base-unit-storage.md)
 * — it only decides how one is read back.
 */

export type Unit = { label: string; baseEquivalent: number };

export type QuantityReading =
  | { decomposed: false; amount: number; unitLabel: string }
  | {
      decomposed: true;
      whole: number;
      wholeUnitLabel: string;
      remainder: number;
      remainderUnitLabel: string;
    };

/**
 * Decomposes against the Default unit only, never a cascade through every
 * Unit — nothing guarantees Units nest cleanly (Base equivalents of 30 and 25
 * don't), so this stops at two terms.
 */
export function readQuantity(
  quantityOnHand: number,
  baseUnitLabel: string,
  defaultUnit: Unit,
  remainderReadingEnabled: boolean | undefined,
): QuantityReading {
  const plain: QuantityReading = {
    decomposed: false,
    amount: quantityOnHand,
    unitLabel: baseUnitLabel,
  };

  // A Default unit no coarser than the Base unit (a single-Unit product, or
  // any product whose Default *is* its Base) has nothing to decompose into —
  // the reading degenerates to the plain one rather than showing "N pcs, 0
  // pcs".
  if (!remainderReadingEnabled || defaultUnit.baseEquivalent <= 1) {
    return plain;
  }

  // A negative count is the ledger disagreeing with the shelf — a recount
  // signal, not a shelf quantity — so trays-and-pieces of it wouldn't mean
  // anything either.
  if (quantityOnHand < 0) return plain;

  const whole = Math.floor(quantityOnHand / defaultUnit.baseEquivalent);
  const remainder = quantityOnHand - whole * defaultUnit.baseEquivalent;
  return {
    decomposed: true,
    whole,
    wholeUnitLabel: defaultUnit.label,
    remainder,
    remainderUnitLabel: baseUnitLabel,
  };
}

/** Drops whichever term is zero rather than always spelling out both. */
export function formatQuantityReading(reading: QuantityReading): string {
  if (!reading.decomposed) return `${reading.amount} ${reading.unitLabel}`;
  if (reading.remainder === 0) {
    return `${reading.whole} ${reading.wholeUnitLabel}`;
  }
  if (reading.whole === 0) {
    return `${reading.remainder} ${reading.remainderUnitLabel}`;
  }
  return `${reading.whole} ${reading.wholeUnitLabel}, ${reading.remainder} ${reading.remainderUnitLabel}`;
}

/**
 * `readQuantity` + `formatQuantityReading` in one call — every caller (the
 * products list, the Register grid, the product detail page, both movement
 * sheets' on-hand hints, the delete gate) always pulls these same four
 * fields off a product and immediately formats the result, so this is that
 * one call rather than six copies of the pair.
 */
export function formatStock(product: {
  quantityOnHand: number;
  baseUnitLabel: string;
  defaultUnit: Unit;
  remainderReadingEnabled?: boolean;
}): string {
  return formatQuantityReading(
    readQuantity(
      product.quantityOnHand,
      product.baseUnitLabel,
      product.defaultUnit,
      product.remainderReadingEnabled,
    ),
  );
}
