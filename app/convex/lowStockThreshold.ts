/**
 * The Low-stock threshold's two denominations.
 *
 * A shopkeeper enters and reads the threshold in the Default unit. The row
 * holds it in Base units. The split keeps a stored number safe from a later
 * Default unit change. "Under 5 trays" stays 150 eggs. It never becomes 5 of
 * something else. See "Low-stock threshold" in CONTEXT.md.
 *
 * Both directions live here, and every surface goes through them. The
 * mutations in products.ts convert on the way in. `withStatus` converts back
 * on every read. The product forms convert a draft the same way. The box and
 * the row therefore cannot disagree.
 */

/** The Unit a threshold is denominated against, which is the Default unit. */
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
  thresholdInDefaultUnits: number,
  defaultUnit: DenominatingUnit,
) {
  return Math.round(thresholdInDefaultUnits * defaultUnit.baseEquivalent);
}

/**
 * The stored threshold read back in the Default unit.
 * A Default unit change can leave a fraction here. The fraction is what the
 * stored count comes to, and no rounding hides it.
 */
export function thresholdInDefaultUnits(
  lowStockThreshold: number,
  defaultUnit: DenominatingUnit,
) {
  return lowStockThreshold / defaultUnit.baseEquivalent;
}
