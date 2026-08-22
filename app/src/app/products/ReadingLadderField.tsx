"use client";

/**
 * The checkboxes that pick a product's Reading ladder, shared by the
 * add-product form and the product detail page so the two never drift into
 * offering different boxes or describing them differently.
 *
 * Deliberately just the boxes and the note beneath them: the detail page wraps
 * this in its `DiffField` (was/reset chrome), and the add-product form in a
 * plain label, so the wrapper stays each form's business.
 *
 * Ticks are addressed by `key`, not by label. The detail page's Units are
 * saved and so their labels are settled, but a label being typed into the add
 * form can be blank or briefly duplicated, and a tick must not follow the
 * wrong row when that happens.
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
  // A new product holds nothing, so its preview reads a made-up figure rather
  // than the shelf. Says so, instead of quoting an amount nobody has.
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
        {/* The Base unit is never a checkbox: it is on every ladder whether or
            not it was chosen, because it is the only Denomination fine enough
            to hold what the coarser ones leave behind. */}
        Always ends in {baseUnitLabel}. Reads
        {previewIsExample ? " e.g. " : " "}"{preview}".
      </p>
    </>
  );
}
