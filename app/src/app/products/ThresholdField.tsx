"use client";

/**
 * The Low-stock threshold field. The add-product form and the product detail
 * page share it, so the threshold cannot come to mean one thing on the screen
 * that creates a product and another on the screen that edits it.
 *
 * The field is a sentence — "Warn me under 5 trays" — over a row of Unit
 * chips. The sentence is why the number and its Unit read as one thing: the
 * Unit is what the number counts, not a second setting beside it. See
 * "Low-stock threshold" in CONTEXT.md.
 *
 * Like `ReadingLadderField`, this is only the field's own controls. The detail
 * page wraps it in its `DiffField`, which carries the was-and-reset chrome. The
 * add form wraps it in a bounded block of its own. The wrapper stays each
 * form's business.
 *
 * On the add form the chips are a live read of Units she is halfway through
 * typing. A row too incomplete to count anything still gets a chip, a dead one
 * saying what it is waiting for. Hiding those rows is what makes a picker over
 * a half-typed list feel broken: she types a Unit, and the row she just added
 * is the one thing the field does not mention.
 */

import { unitLabelFor } from "../../../convex/unitLabels";
import {
  type DraftUnit,
  isPickableUnit,
  resolveDraftThresholdUnit,
  thresholdFieldWording,
} from "./lowStockThresholdField";

/**
 * A Unit row to offer. `key` addresses the row and `label` names it, for the
 * same reason `ReadingLadderField` splits them: a label somebody is typing can
 * be blank or briefly duplicated, and React needs a stable key through that.
 * The pick itself is held by label, because a label is what the row records.
 * Dragging a pick through a rename is each form's business, the same way each
 * already drags its Base unit and Default unit markers.
 */
export type ThresholdUnitOption = DraftUnit & { key: string };

export function ThresholdField({
  id,
  units,
  defaultUnitLabel,
  threshold,
  onThresholdChange,
  pickedLabel,
  onPickLabel,
  borderClassName,
}: {
  id: string;
  units: ThresholdUnitOption[];
  // What the threshold counts until she picks something. The threshold seeds
  // from the Default unit once. It is independent of it afterwards.
  defaultUnitLabel: string;
  threshold: string;
  onThresholdChange: (value: string) => void;
  pickedLabel: string | null;
  onPickLabel: (label: string) => void;
  // The detail page marks a dirty field by colouring its border. The add form
  // has no such state. Only the border is the caller's, because the box's
  // width is part of the sentence: a full-width box would break "Warn me
  // under 5 trays" across three lines.
  borderClassName?: string;
}) {
  const unit = resolveDraftThresholdUnit(units, defaultUnitLabel, pickedLabel);
  const wording = thresholdFieldWording(unit?.label ?? "unit");
  // One Unit is no choice at all, so the Unit reads as fixed text beside the
  // box. A product whose only Unit is still unnamed lands here too, and reads
  // a dash.
  // The test is the number of rows and not the number of pickable ones. A
  // second row she has started and not finished is exactly the row this field
  // must keep mentioning: counting only the pickable ones would hide it until
  // the moment it no longer needs explaining.
  const hasChoice = units.length > 1;

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="text-[15px]">{wording.sentence}</span>
        <input
          id={id}
          type="number"
          value={threshold}
          onChange={(e) => onThresholdChange(e.target.value)}
          placeholder={wording.placeholder}
          className={`w-20 rounded-[10px] border bg-card px-2.5 py-2 text-center text-[15px] ${
            borderClassName ?? "border-line"
          }`}
          // The chips are the label's other half, so a screen reader that
          // reaches the box alone still hears what it counts.
          aria-describedby={`${id}-unit`}
        />
        {!hasChoice && (
          <span id={`${id}-unit`} className="text-[15px]">
            {unit ? wording.unitLabel : "—"}
          </span>
        )}
      </div>
      {hasChoice && (
        <div id={`${id}-unit`}>
          <span className="text-sub mt-2 block text-[12px]">
            {wording.unitsCaption}
          </span>
          {/* Radios and not buttons: these are one choice with several
              answers, and exactly one of them is always in force. Radios also
              bring arrow-key navigation, which a row of buttons would not.
              Each box is hidden and its label is the chip, the way
              `ReadingLadderField` renders its own boxes plainly. */}
          <fieldset className="mt-1 flex flex-wrap gap-1.5">
            <legend className="sr-only">Low-stock threshold Unit</legend>
            {units.map((u) =>
              isPickableUnit(u) ? (
                <label
                  key={u.key}
                  className={`cursor-pointer rounded-full border px-3 py-1 text-[13px] ${
                    unit?.label === u.label
                      ? "border-accent bg-accent text-accent-ink font-semibold"
                      : "border-line"
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    name={`${id}-unit-choice`}
                    checked={unit?.label === u.label}
                    onChange={() => onPickLabel(u.label)}
                  />
                  {unitLabelFor(2, u.label)}
                </label>
              ) : (
                /* A row she has started and not finished. The chip says which
                   box is still empty, so the gap between the Units she typed
                   and the Units she can count in is never unexplained. */
                <span
                  key={u.key}
                  className="text-sub rounded-full border border-dashed border-line px-3 py-1 text-[13px]"
                >
                  {u.label ? `${u.label} — no size yet` : "unnamed Unit"}
                </span>
              ),
            )}
          </fieldset>
        </div>
      )}
    </>
  );
}
