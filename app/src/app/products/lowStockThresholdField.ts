/**
 * The Low-stock threshold box on the two product forms.
 *
 * The box takes a count of the product's Default unit. The row holds Base
 * units. See lowStockThreshold.ts and "Low-stock threshold" in CONTEXT.md.
 *
 * A save can move the Default unit. The box's denomination moves with it, so
 * the number already typed there stops meaning what it meant. `draftAfterSave`
 * re-denominates the draft against the Default unit the product now leads
 * with.
 * Without it, a box nobody touched stays dirty for good. The next save of any
 * other field then sends that stale number, and the threshold silently drops
 * from 150 eggs to 5 eggs.
 */

import { thresholdInDefaultUnits } from "../../../convex/lowStockThreshold";
import { unitLabelFor } from "../../../convex/unitLabels";

/**
 * The box's wording. Both product forms take it from here, so a reword needs
 * one edit.
 * The Unit label is plural, because the box takes a count of them. See
 * unitLabels.ts.
 */
export function thresholdFieldWording(defaultUnitLabel: string) {
  const plural = unitLabelFor(2, defaultUnitLabel);
  return {
    label: `Low-stock threshold override, in ${plural} (optional)`,
    placeholder: `Uses the shop default, in ${plural}`,
  };
}

/**
 * What the box holds once a save lands.
 * `storedBaseUnits` is what the row holds after that save. An absent value
 * leaves the box empty, which reads as "uses the shop default".
 * `nextDefaultUnit` is the Unit the product leads with after that save. The
 * result therefore matches the refreshed `lowStockThresholdInDefaultUnits`
 * that `withStatus` sends back, and the dirty mark clears.
 */
export function draftAfterSave(
  storedBaseUnits: number | undefined,
  nextDefaultUnit: { baseEquivalent: number },
) {
  return storedBaseUnits === undefined
    ? ""
    : String(thresholdInDefaultUnits(storedBaseUnits, nextDefaultUnit));
}
