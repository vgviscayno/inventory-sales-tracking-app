"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArchivedSection } from "../ArchivedSection";
import { StockStatusPill } from "../StockStatusPill";

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  // One query covering both sections — `include: "withArchived"` — split
  // client-side into active and archived, rather than a second `list` call
  // for the collapsed section that would re-run the same server-side scan.
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
  // Extra Units beyond the Base one — eggs' "tray" alongside its "piece".
  // Empty by default: a product needs only its Base unit to be sellable, and
  // nothing here is seeded with a plausible-looking label (see
  // docs/adr/0004-base-unit-locked.md).
  const [extraUnits, setExtraUnits] = useState<
    { key: string; label: string; baseEquivalent: string; price: string }[]
  >([]);
  // Which label to nominate as Default, chosen from whichever labels are
  // currently non-empty — validated against that set at submit time rather
  // than kept in sync as she types, so a mid-edit rename can't leave a
  // dangling selection. Empty means unset (falls back to the Base unit).
  const [defaultUnitLabel, setDefaultUnitLabel] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [adding, setAdding] = useState(false);

  const unitLabels = [
    baseUnitLabel.trim(),
    ...extraUnits.map((u) => u.label.trim()),
  ].filter(Boolean);

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
    setExtraUnits((prev) =>
      prev.map((u) => (u.key === key ? { ...u, ...patch } : u)),
    );
  }

  function removeExtraUnit(key: string) {
    setExtraUnits((prev) => prev.filter((u) => u.key !== key));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setAdding(true);
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
      lowStockThreshold: lowStockThreshold
        ? Number(lowStockThreshold)
        : undefined,
    });
    setName("");
    setBaseUnitLabel("");
    setBaseUnitPrice("");
    setExtraUnits([]);
    setDefaultUnitLabel("");
    setLowStockThreshold("");
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
                onChange={(e) => setBaseUnitLabel(e.target.value)}
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

          <div>
            <label
              htmlFor="product-low-stock-threshold"
              className="text-sub block text-[13px] mb-1"
            >
              Low-stock threshold override (optional)
            </label>
            <input
              id="product-low-stock-threshold"
              type="number"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              placeholder="Uses global default"
              className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
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
                {p.quantityOnHand} in stock
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
