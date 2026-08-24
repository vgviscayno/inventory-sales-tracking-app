/**
 * The Low-stock threshold's two denominations.
 *
 * A shopkeeper enters and reads the threshold in a Unit she names. The row
 * holds it in Base units. The split keeps a stored number safe from a later
 * change to that Unit. "Under 5 trays" stays 150 eggs. It never becomes 5 of
 * something else. See "Low-stock threshold" in CONTEXT.md.
 *
 * Both directions live here, and every surface goes through them. The
 * mutations in products.ts convert on the way in. `withStatus` converts back
 * on every read. The product forms convert a draft the same way. The box and
 * the row therefore cannot disagree.
 *
 * `resolveThresholdUnit` is the third piece: which Unit the other two are
 * handed. A threshold that names no Unit, or names one the product no longer
 * has, is counted in the Default unit.
 */

/** The Unit a threshold is denominated against. */
type DenominatingUnit = { baseEquivalent: number };

/**
 * The Base units an entry comes to.
 * The result is a whole Base-unit count. An entry finer than one Base unit
 * rounds to one. A Base unit is fine enough that this costs nothing the shop
 * can see. See docs/adr/0003-base-unit-storage.md.
 * `Math.round` also clears the float noise of a decimal entry. It matches
 * `deriveBaseAmount` in stockMovements.ts for the same reason.
 */
export function thresholdToBaseUnits(
  thresholdInUnits: number,
  unit: DenominatingUnit,
) {
  return Math.round(thresholdInUnits * unit.baseEquivalent);
}

/**
 * The stored threshold read back in the Unit it is counted in.
 * A change to that Unit's Base equivalent can leave a fraction here. The
 * fraction is what the stored count comes to, and no rounding hides it.
 */
export function thresholdInUnits(
  lowStockThreshold: number,
  unit: DenominatingUnit,
) {
  return lowStockThreshold / unit.baseEquivalent;
}

/**
 * The Unit a threshold is counted in. The label names one of the product's own
 * Units. An absent label means the Default unit, and so does a label naming a
 * Unit that is gone.
 * The fallback lives here rather than at each call site, so the status screen,
 * the two forms, and the mutations all read one stored label the same way. The
 * caller resolves the Default unit and passes it in; this module knows nothing
 * about how a product leads.
 */
export function resolveThresholdUnit<T extends { label: string }>(
  units: T[],
  lowStockThresholdUnitLabel: string | undefined,
  defaultUnit: T,
): T {
  return (
    units.find((u) => u.label === lowStockThresholdUnitLabel) ?? defaultUnit
  );
}
