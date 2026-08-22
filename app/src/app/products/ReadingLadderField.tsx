"use client";

/**
 * The checkboxes that pick a product's Reading ladder. The add-product form and
 * the product detail page share this component. The two therefore never drift
 * into offering different boxes, or into describing them differently.
 *
 * This component is deliberately only the boxes and the note beneath them. The
 * detail page wraps it in its `DiffField`, which carries the was-and-reset
 * chrome. The add-product form wraps it in a plain label. The wrapper therefore
 * stays each form's business.
 *
 * A tick addresses its row by `key` and not by label. The detail page holds
 * saved Units, so their labels are settled. A label somebody types into the add
 * form
 * can be blank or briefly duplicated. A tick must not follow the wrong row when
 * that happens.
 */
export type ReadingLadderItem = {
  key: string;
  label: string;
  checked: boolean;
};

export function ReadingLadderField({
  items,
  baseUnitLabel,
  preview,
  previewIsExample,
  onToggle,
}: {
  items: ReadingLadderItem[];
  baseUnitLabel: string;
  preview: string;
  // A new product holds nothing, so its preview reads a made-up figure and not
  // the shelf. The note says so, and does not quote an amount nobody has.
  previewIsExample: boolean;
  onToggle: (key: string, checked: boolean) => void;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((item) => (
          <label
            key={item.key}
            className="flex items-center gap-1.5 text-[13px]"
          >
            <input
              type="checkbox"
              checked={item.checked}
              onChange={(e) => onToggle(item.key, e.target.checked)}
            />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <p className="text-sub mt-1.5 text-[12px]">
        {/* The Base unit is never a checkbox. It is on every ladder whether or
            not somebody chose it, because it is the only Denomination fine
            enough to hold what the coarser ones leave behind. */}
        Always ends in {baseUnitLabel}. Reads
        {previewIsExample ? " e.g. " : " "}"{preview}".
      </p>
    </>
  );
}
