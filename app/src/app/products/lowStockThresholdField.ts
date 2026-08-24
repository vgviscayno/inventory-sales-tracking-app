/**
 * The Low-stock threshold field on the two product forms.
 *
 * The field reads as a sentence — "Warn me under 5 trays" — and the Unit in it
 * is picked from the product's own Units. The box takes a count of that Unit.
 * The row holds Base units. See lowStockThreshold.ts and "Low-stock threshold"
 * in CONTEXT.md.
 *
 * Two things here are not obvious from the field's markup.
 *
 * The create form's options are the Unit rows as they stand this keystroke,
 * blank names and half-typed sizes included. `isPickableUnit` decides which of
 * them can denominate anything, and `resolveDraftThresholdUnit` decides what
 * the threshold counts when the picked row is gone. Both forms use them, so
 * a settled Units list is not a separate case.
 *
 * A save can move the Unit the threshold reads in — she drops it, or she never
 * named one and the Default unit moved. The box's denomination moves with it,
 * so the number already typed there stops meaning what it meant.
 * `draftAfterSave` re-denominates the draft. Without it, a box nobody touched
 * stays dirty for good. The next save of any other field then sends that stale
 * number, and the threshold silently drops from 150 eggs to 5 eggs.
 */

import { thresholdInUnits } from "../../../convex/lowStockThreshold";
import { unitLabelFor } from "../../../convex/unitLabels";

/** A Unit row as a form holds it, which is not always a complete one. */
export type DraftUnit = { label: string; baseEquivalent: number };

/**
 * The field's wording. Both product forms take it from here, so a reword needs
 * one edit.
 * The Unit is not in the label. It sits in the sentence, beside the box, which
 * is where she changes it. A label that named it too would go stale the moment
 * she picked another.
 * The Unit label is plural, because the box takes a count of them, and because
 * a label that inflected with the entry would jitter on every keystroke. See
 * unitLabels.ts.
 */
export function thresholdFieldWording(thresholdUnitLabel: string) {
  return {
    label: "Low-stock threshold override (optional)",
    sentence: "Warn me under",
    unitLabel: unitLabelFor(2, thresholdUnitLabel),
    // The box is narrow enough that only a dash fits. "(optional)" in the
    // label is what says an empty box means the shop-wide threshold.
    placeholder: "—",
    // The caption over the Unit chips. Without it a bare row of pills is the
    // same shape as the Reading ladder's boxes above it.
    unitsCaption: "counted in",
  };
}

/**
 * Whether a Unit row can denominate a threshold. It needs a name to record and
 * a size to convert by.
 * On the create form both are missing for the first keystrokes of every row,
 * and `baseEquivalent` is `NaN` while the size box is empty. On the detail
 * form every saved row passes, and a row she is adding right now does not.
 */
export function isPickableUnit(unit: DraftUnit) {
  return (
    unit.label !== "" &&
    Number.isFinite(unit.baseEquivalent) &&
    unit.baseEquivalent > 0
  );
}

/**
 * The Unit a threshold draft is counted in.
 * `pickedLabel` is what she chose, and null means she has chosen nothing yet,
 * which reads as the Default unit. A chosen Unit can go away under her — she
 * deletes that row, or empties its size box — and the threshold then falls
 * back rather than counting nothing.
 * The result is null only while no row on the form is complete enough to count
 * anything. A brand new product sits there until its Base unit is named.
 *
 * This mirrors `resolveThresholdUnit` on the server, over rows that are not
 * saved yet. The server resolves a stored label against saved Units; this
 * resolves a picked label against Units that are still being typed, and drops
 * the incomplete rows first.
 */
export function resolveDraftThresholdUnit<T extends DraftUnit>(
  units: T[],
  defaultUnitLabel: string,
  pickedLabel: string | null,
): T | null {
  const pickable = units.filter(isPickableUnit);
  const picked =
    pickedLabel === null
      ? undefined
      : pickable.find((u) => u.label === pickedLabel);
  if (picked) return picked;
  // The same fallback order the server keeps: the Default unit, and failing
  // that the first Unit. See `resolveDefaultUnit` in products.ts.
  return (
    pickable.find((u) => u.label === defaultUnitLabel) ?? pickable[0] ?? null
  );
}

/**
 * What the box holds once a save lands.
 * `storedBaseUnits` is what the row holds after that save. An absent value
 * leaves the box empty, which reads as "uses the shop default".
 * `nextThresholdUnit` is the Unit the threshold reads in after that save. The
 * result therefore matches the refreshed `lowStockThresholdInUnits` that
 * `withStatus` sends back, and the dirty mark clears.
 */
export function draftAfterSave(
  storedBaseUnits: number | undefined,
  nextThresholdUnit: { baseEquivalent: number },
) {
  return storedBaseUnits === undefined
    ? ""
    : String(thresholdInUnits(storedBaseUnits, nextThresholdUnit));
}
