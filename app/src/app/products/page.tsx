"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import {
  formatStock,
  selectableDenominations,
} from "../../../convex/remainderReading";
import { ArchivedSection } from "../ArchivedSection";
import { StockStatusPill } from "../StockStatusPill";
import {
  resolveDraftThresholdUnit,
  thresholdFieldWording,
} from "./lowStockThresholdField";
import { ReadingLadderField } from "./ReadingLadderField";
import { ThresholdField } from "./ThresholdField";

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  // One query covers both sections, with `include: "withArchived"`. The split
  // into active and archived runs on the client. A second `list` call for the
  // collapsed section would re-run the same server-side scan.
  const allProducts =
    useQuery(api.products.list, {
      search: search || undefined,
      include: "withArchived",
    }) ?? [];
  const products = allProducts.filter((p) => p.archivedAt == null);
  const archivedProducts = allProducts.filter((p) => p.archivedAt != null);
  const createProduct = useMutation(api.products.create);

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [baseUnitLabel, setBaseUnitLabel] = useState("");
  const [baseUnitPrice, setBaseUnitPrice] = useState("");
  // Extra Units beyond the Base one, such as an egg's "tray" alongside its
  // "piece". The list is empty by default, because a product needs only its
  // Base unit to be sellable. Nothing here seeds a plausible label. See
  // docs/adr/0004-base-unit-locked.md.
  const [extraUnits, setExtraUnits] = useState<
    { key: string; label: string; baseEquivalent: string; price: string }[]
  >([]);
  // Which label to nominate as Default. The choice comes from whichever labels
  // are non-empty right now. The form validates it against that set at submit
  // time, and does not keep it in step with every keystroke. A mid-edit rename
  // therefore cannot leave a dangling selection.
  // An empty value means unset, which falls back to the Base unit.
  const [defaultUnitLabel, setDefaultUnitLabel] = useState("");
  // The Reading ladder, held as the keys of the ticked rows and not their
  // labels. A label somebody is typing is blank for a keystroke, and it can
  // briefly duplicate another. A key is therefore the only stable handle here,
  // and the form turns keys into labels once, at submit.
  // A rename or a reorder of a row keeps its tick. A cleared Base equivalent
  // only hides the box until the value is back.
  const [ladderKeys, setLadderKeys] = useState<string[]>([]);
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  // Which Unit the threshold counts. null means she has picked none yet, which
  // reads as the Default unit. The pick is held by label, and `updateExtraUnit`
  // below drags it through a rename, the same way the Reading ladder's ticks
  // follow their rows on the detail page.
  const [thresholdUnitLabel, setThresholdUnitLabel] = useState<string | null>(
    null,
  );
  const [adding, setAdding] = useState(false);

  const unitLabels = [
    baseUnitLabel.trim(),
    ...extraUnits.map((u) => u.label.trim()),
  ].filter(Boolean);

  // The Default unit this form is about to send. That is the Base unit while
  // nothing else is nominated. The threshold seeds from it until she picks
  // another Unit.
  const effectiveDefaultUnitLabel = unitLabels.includes(defaultUnitLabel)
    ? defaultUnitLabel
    : baseUnitLabel.trim();

  // The Unit rows exactly as they stand this keystroke, blank names and
  // unparsed sizes included. The threshold's chips read this list, and say so
  // for the rows that cannot count anything yet. See ThresholdField.tsx.
  const thresholdUnitOptions = [
    { key: "base", label: baseUnitLabel.trim(), baseEquivalent: 1 },
    ...extraUnits.map((u) => ({
      key: u.key,
      label: u.label.trim(),
      baseEquivalent: Number(u.baseEquivalent),
    })),
  ];

  // Which Unit the threshold counts right now. The field resolves this for
  // itself; the form needs it too, to label the field and to name the Unit the
  // save records. One resolution, so the two cannot disagree.
  const thresholdUnit = resolveDraftThresholdUnit(
    thresholdUnitOptions,
    effectiveDefaultUnitLabel,
    thresholdUnitLabel,
  );
  const thresholdWording = thresholdFieldWording(
    thresholdUnit?.label ?? "unit",
  );

  const canAdd =
    name.trim() &&
    baseUnitLabel.trim() &&
    Number(baseUnitPrice) > 0 &&
    extraUnits.every(
      (u) =>
        u.label.trim() &&
        Number.isInteger(Number(u.baseEquivalent)) &&
        Number(u.baseEquivalent) > 0 &&
        Number(u.price) > 0,
    ) &&
    new Set(
      [baseUnitLabel.trim(), ...extraUnits.map((u) => u.label.trim())].map(
        (l) => l.toLowerCase(),
      ),
    ).size ===
      extraUnits.length + 1;

  // The boxes to offer. The form asks the reading itself, so it can never offer
  // a Denomination `buildReadingLadder` would drop. Each row carries its key
  // through, because a tick is held by key.
  // Only an extra Unit qualifies. The Base unit is on every ladder already, and
  // a row is a candidate only once its Base equivalent parses.
  const denominations = selectableDenominations({
    units: extraUnits.map((u) => ({
      key: u.key,
      label: u.label.trim(),
      baseEquivalent: Number(u.baseEquivalent),
    })),
    baseUnitLabel: baseUnitLabel.trim(),
  });
  // A new product is born holding nothing, so there is no real figure to read
  // back. One of the coarsest Denomination plus one Base unit stands in.
  const readingPreview = formatStock({
    units: [
      { label: baseUnitLabel.trim(), baseEquivalent: 1 },
      ...denominations.map((d) => ({
        label: d.label,
        baseEquivalent: d.baseEquivalent,
      })),
    ],
    baseUnitLabel: baseUnitLabel.trim(),
    denominationLabels: denominations
      .filter((d) => ladderKeys.includes(d.key))
      .map((d) => d.label),
    quantityOnHand: (denominations[0]?.baseEquivalent ?? 0) + 1,
  });

  function toggleDenomination(key: string, on: boolean) {
    setLadderKeys((keys) =>
      on ? [...keys, key] : keys.filter((k) => k !== key),
    );
  }

  // The Base unit is a row like any other here, so a rename of it drags the
  // threshold's pick the same way `updateExtraUnit` does. The Default unit
  // marker needs no such care: it holds "" for the Base unit rather than its
  // label.
  function changeBaseUnitLabel(value: string) {
    if (baseUnitLabel.trim() === thresholdUnitLabel) {
      setThresholdUnitLabel(value.trim());
    }
    setBaseUnitLabel(value);
  }

  function addExtraUnit() {
    setExtraUnits((prev) => [
      ...prev,
      { key: `unit:${Date.now()}`, label: "", baseEquivalent: "", price: "" },
    ]);
  }

  function updateExtraUnit(
    key: string,
    patch: Partial<{ label: string; baseEquivalent: string; price: string }>,
  ) {
    const old = extraUnits.find((u) => u.key === key);
    setExtraUnits((prev) =>
      prev.map((u) => (u.key === key ? { ...u, ...patch } : u)),
    );
    // The threshold's Unit is held by label, and a rename moves the label. The
    // pick follows the row it was made on.
    // Without this, renaming a picked row re-denominates the threshold between
    // two keystrokes: "5 trays" becomes 5 pieces, and 150 eggs become 5, with
    // nothing on screen to say so. The detail page drags its Base unit and
    // Default unit markers through a rename for the same reason.
    if (
      patch.label !== undefined &&
      old !== undefined &&
      old.label.trim() === thresholdUnitLabel
    ) {
      setThresholdUnitLabel(patch.label.trim());
    }
  }

  function removeExtraUnit(key: string) {
    const removed = extraUnits.find((u) => u.key === key);
    setExtraUnits((prev) => prev.filter((u) => u.key !== key));
    // The row is gone for good, unlike a half-typed one, so its tick goes too.
    setLadderKeys((keys) => keys.filter((k) => k !== key));
    // So does the threshold's pick. The threshold then counts the Default
    // unit, which is the same rule the mutation applies to a Unit that leaves
    // a saved product.
    if (removed !== undefined && removed.label.trim() === thresholdUnitLabel) {
      setThresholdUnitLabel(null);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setAdding(true);
    const ladderLabels = denominations
      .filter((d) => ladderKeys.includes(d.key))
      .map((d) => d.label);
    await createProduct({
      name: name.trim(),
      units: [
        {
          label: baseUnitLabel.trim(),
          baseEquivalent: 1,
          price: Number(baseUnitPrice),
        },
        ...extraUnits.map((u) => ({
          label: u.label.trim(),
          baseEquivalent: Number(u.baseEquivalent),
          price: Number(u.price),
        })),
      ],
      baseUnitLabel: baseUnitLabel.trim(),
      defaultUnitLabel: unitLabels.includes(defaultUnitLabel)
        ? defaultUnitLabel
        : undefined,
      lowStockThresholdInUnits: lowStockThreshold
        ? Number(lowStockThreshold)
        : undefined,
      // The Unit travels with the number, and only with it. An empty box
      // leaves both out, which is what the shop-wide threshold standing in
      // means. See `validateThresholdUnit` in products.ts.
      lowStockThresholdUnitLabel:
        lowStockThreshold && thresholdUnit ? thresholdUnit.label : undefined,
      // Keys become labels here, and only here. Nothing ticked sends nothing at
      // all, because an absent ladder already means the plain Base-unit
      // reading.
      denominationLabels: ladderLabels.length > 0 ? ladderLabels : undefined,
    });
    setName("");
    setBaseUnitLabel("");
    setBaseUnitPrice("");
    setExtraUnits([]);
    setDefaultUnitLabel("");
    setLadderKeys([]);
    setLowStockThreshold("");
    setThresholdUnitLabel(null);
    setAdding(false);
    setFormOpen(false);
  }

  return (
    <main className="flex-1 p-3.5 space-y-3">
      <h2 className="mt-1 mb-1 text-lg font-semibold">Products</h2>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products…"
        className="w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-[15px]"
      />

      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-ink"
        >
          + Add Product
        </button>
      ) : (
        <form onSubmit={handleAdd} className="card space-y-2.5 p-3">
          <div>
            <label
              htmlFor="product-name"
              className="text-sub block text-[13px] mb-1"
            >
              Name
            </label>
            <input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
            />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label
                htmlFor="product-base-unit-label"
                className="text-sub block text-[13px] mb-1"
              >
                Base unit
              </label>
              <input
                id="product-base-unit-label"
                value={baseUnitLabel}
                onChange={(e) => changeBaseUnitLabel(e.target.value)}
                placeholder="e.g. piece, gram"
                className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="product-base-unit-price"
                className="text-sub block text-[13px] mb-1"
              >
                Price
              </label>
              <input
                id="product-base-unit-price"
                type="number"
                value={baseUnitPrice}
                onChange={(e) => setBaseUnitPrice(e.target.value)}
                placeholder="0"
                className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
              />
            </div>
          </div>
          <p className="text-sub text-[13px]">
            Every quantity this product's stock is held in — how much is on
            hand, the low-stock threshold — is counted in the Base unit. Choose
            one fine enough that everything sold comes to a whole number of it
            (grams, not kilos, for rice sold by the fraction). Starts at 0 in
            stock — log a delivery on the Movements tab to add stock once
            it&apos;s saved.
          </p>

          {extraUnits.map((unit) => (
            <div
              key={unit.key}
              className="flex items-end gap-2 rounded-lg border border-line p-2"
            >
              <div className="flex-1">
                <label
                  htmlFor={`extra-unit-label-${unit.key}`}
                  className="text-sub block text-[13px] mb-1"
                >
                  Unit
                </label>
                <input
                  id={`extra-unit-label-${unit.key}`}
                  value={unit.label}
                  onChange={(e) =>
                    updateExtraUnit(unit.key, { label: e.target.value })
                  }
                  placeholder="e.g. tray"
                  className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2 text-[15px]"
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor={`extra-unit-equivalent-${unit.key}`}
                  className="text-sub block text-[13px] mb-1"
                >
                  = how many Base
                </label>
                <input
                  id={`extra-unit-equivalent-${unit.key}`}
                  type="number"
                  value={unit.baseEquivalent}
                  onChange={(e) =>
                    updateExtraUnit(unit.key, {
                      baseEquivalent: e.target.value,
                    })
                  }
                  placeholder="30"
                  className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2 text-[15px]"
                />
              </div>
              <div className="flex-1">
                <label
                  htmlFor={`extra-unit-price-${unit.key}`}
                  className="text-sub block text-[13px] mb-1"
                >
                  Price
                </label>
                <input
                  id={`extra-unit-price-${unit.key}`}
                  type="number"
                  value={unit.price}
                  onChange={(e) =>
                    updateExtraUnit(unit.key, { price: e.target.value })
                  }
                  placeholder="0"
                  className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2 text-[15px]"
                />
              </div>
              <button
                type="button"
                onClick={() => removeExtraUnit(unit.key)}
                aria-label={`Remove Unit "${unit.label || "unnamed"}"`}
                className="text-danger px-1 pb-2.5 text-lg leading-none"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addExtraUnit}
            className="text-accent text-[13px] font-semibold"
          >
            + Add another Unit
          </button>

          {unitLabels.length > 1 && (
            <div>
              <label
                htmlFor="product-default-unit"
                className="text-sub block text-[13px] mb-1"
              >
                Default unit — the one its listed price is quoted in and the
                Register preselects
              </label>
              <select
                id="product-default-unit"
                value={
                  unitLabels.includes(defaultUnitLabel) ? defaultUnitLabel : ""
                }
                onChange={(e) => setDefaultUnitLabel(e.target.value)}
                className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
              >
                <option value="">
                  {baseUnitLabel.trim() || "Base unit"} (default)
                </option>
                {unitLabels
                  .filter((label) => label !== baseUnitLabel.trim())
                  .map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
              </select>
            </div>
          )}

          {/* This field appears the moment a Unit coarser than the Base one
              exists. The detail page uses the same rule, and the Default unit
              select above already pops in the same way. A single-Unit product
              never sees it, because its stock reads the plain way either
              way. */}
          {denominations.length > 0 && (
            /* A bounded block, like the threshold below it. Two runs of small
               pill-shaped controls one under the other read as one field
               otherwise. The boundary, and not the spacing, is what says where
               one field stops. */
            <div className="rounded-xl border border-line p-2.5">
              <span className="mb-1.5 block text-[13px] font-semibold">
                Read stock in
              </span>
              <ReadingLadderField
                items={denominations.map((d) => ({
                  key: d.key,
                  label: d.label,
                  checked: ladderKeys.includes(d.key),
                }))}
                baseUnitLabel={baseUnitLabel.trim()}
                preview={readingPreview}
                previewIsExample
                onToggle={toggleDenomination}
              />
            </div>
          )}

          <div className="rounded-xl border border-line p-2.5">
            <label
              htmlFor="product-low-stock-threshold"
              className="mb-1.5 block text-[13px] font-semibold"
            >
              {thresholdWording.label}
            </label>
            <ThresholdField
              id="product-low-stock-threshold"
              units={thresholdUnitOptions}
              defaultUnitLabel={effectiveDefaultUnitLabel}
              threshold={lowStockThreshold}
              onThresholdChange={setLowStockThreshold}
              pickedLabel={thresholdUnitLabel}
              onPickLabel={setThresholdUnitLabel}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="card flex-1 py-2.5 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding || !canAdd}
              className="flex-1 rounded-xl bg-accent py-2.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {products.map((p) => (
          <Link
            key={p._id}
            href={`/products/${p._id}`}
            className="card flex items-center justify-between px-3 py-3"
          >
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="text-sub text-[13px]">
                ₱{p.defaultUnit.price.toFixed(2)}/{p.defaultUnit.label} ·{" "}
                {formatStock(p)} in stock
              </div>
            </div>
            <StockStatusPill status={p.lowStockStatus} />
          </Link>
        ))}
        {products.length === 0 && (
          <p className="text-sub text-center py-8">No products found</p>
        )}
      </div>

      <ArchivedSection count={archivedProducts.length}>
        {archivedProducts.map((p) => (
          <Link
            key={p._id}
            href={`/products/${p._id}`}
            className="card flex items-center justify-between px-3 py-3 opacity-70"
          >
            <div className="font-semibold">{p.name}</div>
            <span className="pill archived">Archived</span>
          </Link>
        ))}
      </ArchivedSection>
    </main>
  );
}
