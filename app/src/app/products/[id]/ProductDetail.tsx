"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import {
  formatStock,
  selectableDenominations,
} from "../../../../convex/remainderReading";
import { formatTime, signed } from "../../format";
import { DeliverySheet } from "../../movements/DeliverySheet";
import { PulloutSheet } from "../../movements/PulloutSheet";
import { SaleEntrySheet } from "../../movements/SaleEntrySheet";
import { StockStatusPill } from "../../StockStatusPill";
import { WindowedDayList } from "../../WindowedDayList";

// Derived from the query rather than restated, so a new field — or a new stock
// status — reaches this form without anyone remembering to widen a type here.
type Product = NonNullable<FunctionReturnType<typeof api.products.get>>;

// A Unit under edit. Held as strings so the number fields can sit empty or
// half-typed while she works; parsed back to numbers only at save.
type UnitDraft = { label: string; baseEquivalent: string; price: string };

function toDrafts(units: Product["units"]): UnitDraft[] {
  return units.map((u) => ({
    label: u.label,
    baseEquivalent: String(u.baseEquivalent),
    price: String(u.price),
  }));
}

type LedgerRow = FunctionReturnType<
  typeof api.stockMovements.listForProduct
>[number];

const LEDGER_HEADER_H = 30;
const LEDGER_ROW_H = 58;
const LEDGER_VIEWPORT_H = 420;

const LEDGER_LABEL: Record<LedgerRow["type"], string> = {
  delivery: "Delivery",
  pullout: "Pull-out",
  sale: "Sale",
};

export function ProductDetail({ productId }: { productId: Id<"products"> }) {
  const product = useQuery(api.products.get, { id: productId });

  if (product === undefined) {
    return <main className="text-sub flex-1 p-4">Loading...</main>;
  }
  if (product === null) {
    return <main className="text-sub flex-1 p-4">Product not found</main>;
  }

  return <ProductForm key={product._id} product={product} />;
}

function ProductForm({ product }: { product: Product }) {
  const router = useRouter();
  const updateProduct = useMutation(api.products.update);
  const archiveProduct = useMutation(api.products.archive);
  const unarchiveProduct = useMutation(api.products.unarchive);
  const deleteProduct = useMutation(api.products.remove);

  // The saved values, derived fresh from the live product on every render.
  // A successful save updates `product` (Convex query), so these follow it and
  // the dirty marks below clear on their own — no remount, no manual resync.
  const savedName = product.name;
  const savedUnits = toDrafts(product.units);
  const savedBaseUnitLabel = product.baseUnitLabel;
  // Only tracked for a multi-Unit product — a single-Unit one has nothing to
  // choose (its one Unit is already both Base and Default), so it never gets
  // offered the picker below, and this stays null.
  const savedDefault =
    product.units.length > 1 ? product.defaultUnit.label : null;
  const savedThreshold =
    product.lowStockThreshold != null ? String(product.lowStockThreshold) : "";
  const savedDenominationLabels = product.denominationLabels ?? [];

  const [name, setName] = useState(savedName);
  const [units, setUnits] = useState<UnitDraft[]>(savedUnits);
  const [baseUnitLabel, setBaseUnitLabel] = useState(savedBaseUnitLabel);
  const [defaultUnitLabel, setDefaultUnitLabel] = useState<string | null>(
    savedDefault,
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(savedThreshold);
  // The Reading ladder, held as the set of ticked labels. Order isn't kept
  // because it isn't read: `buildReadingLadder` sorts by descending Base
  // equivalent regardless of what was ticked when.
  const [denominationLabels, setDenominationLabels] = useState<string[]>(
    savedDenominationLabels,
  );
  const [saving, setSaving] = useState(false);
  // The mutation's refusals — a locked Base unit above all — are the whole
  // point of some of these edits, so a rejected save has to surface its reason
  // rather than silently doing nothing.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  // Only reached when the product still holds stock — see `handleArchive`.
  // Archiving is never blocked, so this exists purely so she sees the count
  // before it happens, not to gate the action itself.
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Delete is one-way, so it gets the same two-tap confirm as archive does —
  // even though the button is already disabled until the count is zero.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isArchived = product.archivedAt != null;
  // How this product's quantity reads everywhere on this screen — one
  // resolution so the field, the delete-gate mirror, and the archive confirm
  // never show two different denominations at once (see CONTEXT.md's
  // "Remainder reading").
  const formattedQuantity = formatStock(product);
  // Mirrors the server's gate (see `products.remove`) so what the button
  // shows and what it's actually allowed to do never disagree.
  const deleteBlockedReason =
    product.quantityOnHand === 0
      ? null
      : product.quantityOnHand > 0
        ? `${formattedQuantity} still on hand — pull them out first`
        : `${formattedQuantity} on hand — recount to fix before deleting`;
  // Which entry a ledger row tap opened, if any — opening rows have no
  // `refId` and so never set this.
  const [openEntry, setOpenEntry] = useState<
    | { kind: "delivery"; entryId: Id<"deliveries"> }
    | { kind: "pullout"; entryId: Id<"pullouts"> }
    | { kind: "sale"; entryId: Id<"sales"> }
    | null
  >(null);

  // What's edited but not yet saved. Each dirty field flags itself in the form
  // below (amber rail, "was …", a per-field reset), and the Save button carries
  // the count — so needing a tap to commit is never a surprise, least of all
  // for the default-unit swap, which otherwise looks identical once selected.
  const nameDirty = name !== savedName;
  const unitsDirty =
    JSON.stringify(units) !== JSON.stringify(savedUnits) ||
    baseUnitLabel !== savedBaseUnitLabel;
  const defaultDirty = defaultUnitLabel !== savedDefault;
  const thresholdDirty = lowStockThreshold !== savedThreshold;
  // Compared as a set: which Units are on the ladder is the whole of the
  // choice, so re-ticking two boxes in the other order is not an edit.
  const readingDirty = !sameLabels(denominationLabels, savedDenominationLabels);
  const dirtyCount = [
    nameDirty,
    unitsDirty,
    defaultDirty,
    thresholdDirty,
    readingDirty,
  ].filter(Boolean).length;
  const isDirty = dirtyCount > 0;

  // The Base unit's Base equivalent is fixed at 1, so it's parsed but never
  // entered. The rest mirror the server's `validateUnits` so Save is offered
  // only when the mutation would accept the list — the throw is still the
  // guarantee, this just spares her a round-trip to learn the obvious.
  const parsedUnits = units.map((u) => ({
    label: u.label.trim(),
    baseEquivalent: Number(u.baseEquivalent),
    price: Number(u.price),
  }));
  // The Base and Default markers name a Unit by its label, but the labels are
  // trimmed on the way to the server — so the markers have to be trimmed to the
  // same shape, or a stray space would make the Base unit look absent (Save
  // silently greys, or the mutation rejects a list that's really fine).
  const baseUnitTrimmed = baseUnitLabel.trim();
  const labelsLower = parsedUnits.map((u) => u.label.toLowerCase());
  const unitsValid =
    parsedUnits.length > 0 &&
    parsedUnits.every(
      (u) =>
        u.label.length > 0 &&
        Number.isInteger(u.baseEquivalent) &&
        u.baseEquivalent > 0 &&
        u.price > 0,
    ) &&
    new Set(labelsLower).size === labelsLower.length &&
    parsedUnits.find((u) => u.label === baseUnitTrimmed)?.baseEquivalent === 1;

  const canSave = name.trim().length > 0 && unitsValid;

  // The boxes to offer, asked of the reading itself rather than re-derived
  // here — the form must never offer a denomination `buildReadingLadder` would drop.
  // Taken from the drafts rather than the saved product, so ticking a Unit
  // added, renamed, or re-scaled in this same unsaved edit works. A product
  // with no coarser Unit at all (a single-Unit one) is never offered the
  // selector, since its reading is the plain one either way.
  const denominations = selectableDenominations({
    units: parsedUnits,
    baseUnitLabel: baseUnitTrimmed,
  });
  // The reading as it would come out if this edit were saved, over the stock
  // actually on hand. A product holding nothing (or a negative count, which
  // always reads plainly) has no figure worth previewing, so one of the
  // coarsest denomination plus one Base unit stands in.
  const previewAmount =
    product.quantityOnHand > 0
      ? product.quantityOnHand
      : (denominations[0]?.baseEquivalent ?? 0) + 1;
  const readingPreview = formatStock({
    units: parsedUnits,
    baseUnitLabel: baseUnitTrimmed,
    denominationLabels,
    quantityOnHand: previewAmount,
  });

  function resetUnits() {
    setUnits(savedUnits);
    setBaseUnitLabel(savedBaseUnitLabel);
    setDefaultUnitLabel(savedDefault);
  }

  function toggleDenomination(label: string, on: boolean) {
    setDenominationLabels((labels) =>
      on ? [...labels, label] : labels.filter((l) => l !== label),
    );
  }

  // Editing a Unit's label has to drag the Base and Default markers along with
  // it, since both name a Unit by its label — otherwise renaming the Base unit
  // would quietly point the marker at a label that no longer exists.
  function editUnit(index: number, field: keyof UnitDraft, value: string) {
    const old = units[index];
    setUnits(units.map((u, i) => (i === index ? { ...u, [field]: value } : u)));
    if (field === "label") {
      if (old.label === baseUnitLabel) setBaseUnitLabel(value);
      if (old.label === defaultUnitLabel) setDefaultUnitLabel(value);
      // The ladder names its denominations by label too, so a rename has to drag them
      // with it — otherwise the denomination would silently drop off the reading.
      setDenominationLabels((labels) =>
        labels.map((l) => (l === old.label ? value : l)),
      );
    }
  }

  function chooseBase(label: string) {
    setBaseUnitLabel(label);
    // A Base unit is one of itself, so its Base equivalent snaps to 1.
    setUnits(
      units.map((u) => (u.label === label ? { ...u, baseEquivalent: "1" } : u)),
    );
  }

  function removeUnit(index: number) {
    const removed = units[index];
    setUnits(units.filter((_, i) => i !== index));
    // A removed Default falls back to the Base unit (server does the same).
    if (removed.label === defaultUnitLabel) setDefaultUnitLabel(null);
    setDenominationLabels((labels) =>
      labels.filter((l) => l !== removed.label),
    );
  }

  function addUnit() {
    setUnits([...units, { label: "", baseEquivalent: "", price: "" }]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateProduct({
        id: product._id,
        name: name.trim(),
        ...(unitsDirty ? { units: parsedUnits } : {}),
        // Only sent when it actually moves — the mutation reads a changed
        // Base unit as a reassignment attempt and locks it behind "no
        // movements", so an unchanged one (or one differing only by trimmed
        // whitespace) must not trip that.
        ...(unitsDirty && baseUnitTrimmed !== savedBaseUnitLabel
          ? { baseUnitLabel: baseUnitTrimmed }
          : {}),
        ...(defaultDirty
          ? { defaultUnitLabel: defaultUnitLabel?.trim() ?? null }
          : {}),
        lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : null,
        ...(readingDirty ? { denominationLabels } : {}),
      });
      // Canonicalize the local drafts to exactly what the reactive query will
      // hand back, so every dirty mark clears instead of relying on the typed
      // strings happening to match the saved round-trip. Two mismatches
      // otherwise leave the Units group amber forever: a price typed "10.50"
      // (stored 10.5 → "10.5") or a stray space in a label never string-equals
      // `savedUnits`; and an *unset* Default silently follows the Base unit in
      // `savedDefault`, so reassigning the Base — or adding a Unit that crosses
      // 1 → 2 — moves the saved Default out from under a local one that didn't.
      setName(name.trim());
      setUnits(
        parsedUnits.map((u) => ({
          label: u.label,
          baseEquivalent: String(u.baseEquivalent),
          price: String(u.price),
        })),
      );
      setBaseUnitLabel(baseUnitTrimmed);
      setLowStockThreshold(
        lowStockThreshold ? String(Number(lowStockThreshold)) : "",
      );
      // The Default's resulting stored value: what we sent if it moved,
      // otherwise the product's own — unless that Unit was just removed, which
      // the mutation clears (see `products.update`). Then resolve it the one
      // way `withStatus` does — unset falls back to the Base unit — so it lands
      // on the same label the refreshed `savedDefault` will.
      const nextStoredDefault = defaultDirty
        ? (defaultUnitLabel?.trim() ?? null)
        : product.defaultUnitLabel != null &&
            parsedUnits.some((u) => u.label === product.defaultUnitLabel)
          ? product.defaultUnitLabel
          : null;
      setDefaultUnitLabel(
        parsedUnits.length <= 1
          ? null
          : (
              parsedUnits.find(
                (u) => u.label === (nextStoredDefault ?? baseUnitTrimmed),
              ) ?? parsedUnits[0]
            ).label,
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // Only a product still holding stock needs a look before archiving — one
  // with nothing on hand has nothing to warn about, so it archives on the
  // first tap. Archiving itself is never refused either way; the confirm
  // exists only so she sees the count before it disappears from the grid.
  async function handleArchive() {
    if (product.quantityOnHand !== 0 && !confirmingArchive) {
      setConfirmingArchive(true);
      return;
    }
    setArchiving(true);
    await archiveProduct({ id: product._id });
    setArchiving(false);
    setConfirmingArchive(false);
  }

  async function handleUnarchive() {
    setArchiving(true);
    await unarchiveProduct({ id: product._id });
    setArchiving(false);
  }

  // For good — no undo after this, so navigating away is part of the action:
  // this page has nothing left to show once the product is gone from every
  // list that would have linked back to it.
  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    await deleteProduct({ id: product._id });
    router.push("/products");
  }

  return (
    <main className="flex-1 p-3.5 space-y-3">
      <Link href="/products" className="mb-1 inline-block text-xl">
        &larr;
      </Link>

      <form onSubmit={handleSave} className="card space-y-2.5 p-3">
        <DiffField
          label="Name"
          htmlFor="edit-name"
          dirty={nameDirty}
          was={savedName}
          onReset={() => setName(savedName)}
        >
          <input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={fieldInputClass(nameDirty)}
          />
        </DiffField>
        <div>
          <div className="text-sub block text-[13px] mb-1">Qty on hand</div>
          <div className="px-2.5 py-2.5 text-[15px] font-semibold">
            {formattedQuantity}
          </div>
        </div>
        <Link href="/movements" className="text-accent block text-[13px]">
          Log a delivery to change this count →
        </Link>
        <UnitsEditor
          units={units}
          baseUnitLabel={baseUnitLabel}
          defaultUnitLabel={defaultUnitLabel}
          savedUnits={savedUnits}
          savedBaseUnitLabel={savedBaseUnitLabel}
          savedDefault={savedDefault}
          dirty={unitsDirty || defaultDirty}
          hasMovements={product.hasMovements}
          onEditUnit={editUnit}
          onChooseBase={chooseBase}
          onChooseDefault={setDefaultUnitLabel}
          onRemoveUnit={removeUnit}
          onAddUnit={addUnit}
          onReset={resetUnits}
        />
        <DiffField
          label="Low-stock threshold override (optional)"
          htmlFor="edit-low-stock-threshold"
          dirty={thresholdDirty}
          was={savedThreshold || "global default"}
          onReset={() => setLowStockThreshold(savedThreshold)}
        >
          <input
            id="edit-low-stock-threshold"
            type="number"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
            placeholder="Uses global default"
            className={fieldInputClass(thresholdDirty)}
          />
        </DiffField>
        {denominations.length > 0 && (
          <DiffField
            label="Read stock in"
            dirty={readingDirty}
            was={
              savedDenominationLabels.length > 0
                ? savedDenominationLabels.join(", ")
                : `${savedBaseUnitLabel} only`
            }
            onReset={() => setDenominationLabels(savedDenominationLabels)}
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {denominations.map((unit) => (
                <label
                  key={unit.label}
                  className="flex items-center gap-1.5 text-[13px]"
                >
                  <input
                    type="checkbox"
                    checked={denominationLabels.includes(unit.label)}
                    onChange={(e) =>
                      toggleDenomination(unit.label, e.target.checked)
                    }
                  />
                  <span>{unit.label}</span>
                </label>
              ))}
            </div>
            <p className="text-sub mt-1.5 text-[12px]">
              {/* The Base unit is never a checkbox: it is on every ladder
                  whether or not it was chosen, because it is the only denomination
                  fine enough to hold what the coarser ones leave behind. */}
              Always ends in {baseUnitTrimmed}. Reads
              {product.quantityOnHand > 0 ? " " : " e.g. "}"{readingPreview}".
            </p>
          </DiffField>
        )}
        {isArchived ? (
          <span className="pill archived inline-block">Archived</span>
        ) : (
          <StockStatusPill
            status={product.lowStockStatus}
            className="inline-block"
          />
        )}
        <button
          type="submit"
          disabled={saving || !canSave || !isDirty}
          className={`w-full rounded-xl py-2.5 font-bold ${
            isDirty && canSave
              ? "bg-amber-400 text-ink"
              : "bg-[#d6d3d1] text-white"
          }`}
        >
          {saving
            ? "Saving..."
            : isDirty
              ? `Save ${dirtyCount} change${dirtyCount > 1 ? "s" : ""}`
              : "No changes to save"}
        </button>
        {saveError && (
          <p className="rounded-lg border border-danger bg-danger/5 px-2.5 py-2 text-[13px] text-danger">
            {saveError}
          </p>
        )}
      </form>

      {isArchived ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleUnarchive}
            disabled={archiving}
            className="w-full rounded-xl border border-line py-2.5 font-semibold"
          >
            {archiving ? "Unarchiving..." : "Unarchive Product"}
          </button>
          <div className="flex gap-2">
            {confirmingDelete && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="card flex-1 py-2.5 font-semibold"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting || deleteBlockedReason !== null}
              className={`flex-1 rounded-xl border py-2.5 font-semibold disabled:opacity-50 ${
                confirmingDelete
                  ? "bg-danger border-danger text-white"
                  : "text-danger border-line"
              }`}
            >
              {deleting
                ? "Deleting..."
                : confirmingDelete
                  ? "Confirm Delete"
                  : "Delete Product"}
            </button>
          </div>
          {deleteBlockedReason && (
            <p className="text-sub text-[13px]">{deleteBlockedReason}</p>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          {confirmingArchive && (
            <button
              type="button"
              onClick={() => setConfirmingArchive(false)}
              disabled={archiving}
              className="card flex-1 py-2.5 font-semibold"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleArchive}
            disabled={archiving}
            className={`flex-1 rounded-xl border py-2.5 font-semibold ${
              confirmingArchive
                ? "bg-danger border-danger text-white"
                : "text-danger border-line"
            }`}
          >
            {archiving
              ? "Archiving..."
              : confirmingArchive
                ? `Confirm Archive (${formattedQuantity} in stock)`
                : "Archive Product"}
          </button>
        </div>
      )}

      <ProductLedger productId={product._id} onOpenEntry={setOpenEntry} />

      {openEntry?.kind === "delivery" && (
        <DeliverySheet
          onClose={() => setOpenEntry(null)}
          entryId={openEntry.entryId}
          focusProductId={product._id}
        />
      )}
      {openEntry?.kind === "pullout" && (
        <PulloutSheet
          onClose={() => setOpenEntry(null)}
          entryId={openEntry.entryId}
          focusProductId={product._id}
        />
      )}
      {openEntry?.kind === "sale" && (
        <SaleEntrySheet
          onClose={() => setOpenEntry(null)}
          entryId={openEntry.entryId}
          focusProductId={product._id}
        />
      )}
    </main>
  );
}

const FIELD_INPUT_BASE =
  "w-full rounded-[10px] border bg-card px-2.5 py-2.5 text-[15px]";

/**
 * Whether two ladders name the same Units. Order is deliberately not part of
 * it — the reading sorts its own denominations (see `buildReadingLadder`), so ticking
 * the same two boxes in the other order has changed nothing to save.
 */
function sameLabels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const inB = new Set(b);
  return a.every((label) => inB.has(label));
}

// An edited input gets an amber border + ring so the change is visible even
// with the field scrolled past its label.
function fieldInputClass(dirty: boolean): string {
  return `${FIELD_INPUT_BASE} ${
    dirty ? "border-amber-400 ring-1 ring-amber-300" : "border-line"
  }`;
}

const UNIT_INPUT =
  "rounded-[8px] border border-line bg-card px-2 py-1.5 text-[14px]";

/**
 * The Units of a product, all editable in place: a label, a Base equivalent
 * (fixed at 1 and read-only for the Base unit), and a price per Unit, plus the
 * two markers — which Unit is the Base and which leads as the Default. Adding a
 * Unit and removing a non-Base one are the same list, so correcting eggs to add
 * a tray, or dropping a Unit she's stopped selling, never leaves this screen.
 *
 * Two refusals live on the server (see `products.update`) and are mirrored
 * here only as affordances, never as the guarantee: the Base unit can't be
 * removed (it has no remove control), and it can't be reassigned once the
 * product has movements (the Base radios go disabled, with the reason spelt
 * out). The mutation still throws either way, and that throw surfaces below the
 * Save button.
 */
function UnitsEditor({
  units,
  baseUnitLabel,
  defaultUnitLabel,
  savedUnits,
  savedBaseUnitLabel,
  savedDefault,
  dirty,
  hasMovements,
  onEditUnit,
  onChooseBase,
  onChooseDefault,
  onRemoveUnit,
  onAddUnit,
  onReset,
}: {
  units: UnitDraft[];
  baseUnitLabel: string;
  defaultUnitLabel: string | null;
  savedUnits: UnitDraft[];
  savedBaseUnitLabel: string;
  savedDefault: string | null;
  dirty: boolean;
  hasMovements: boolean;
  onEditUnit: (index: number, field: keyof UnitDraft, value: string) => void;
  onChooseBase: (label: string) => void;
  onChooseDefault: (label: string) => void;
  onRemoveUnit: (index: number) => void;
  onAddUnit: () => void;
  onReset: () => void;
}) {
  const multiUnit = units.length > 1;
  const savedByLabel = new Map(savedUnits.map((u) => [u.label, u]));

  return (
    <div
      className={
        dirty
          ? "rounded-r-lg border-l-[3px] border-amber-400 bg-amber-50/60 py-1.5 pl-2.5"
          : undefined
      }
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sub text-[13px]">Units</span>
        {dirty && (
          <>
            <span className="rounded bg-amber-400 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-ink">
              Edited
            </span>
            <button
              type="button"
              onClick={onReset}
              className="text-sub ml-auto text-[12px] underline"
            >
              ↺ reset
            </button>
          </>
        )}
      </div>
      {multiUnit && (
        <p className="text-sub text-[13px] mb-1.5">
          Base — what stock is counted in. Default — the one its listed price is
          quoted in and the Register preselects.
        </p>
      )}

      <div className="space-y-1.5">
        {units.map((unit, index) => {
          const isBase = baseUnitLabel === unit.label;
          const isDefault = defaultUnitLabel === unit.label;
          const saved = savedByLabel.get(unit.label);
          const rowDirty =
            !saved ||
            saved.baseEquivalent !== unit.baseEquivalent ||
            saved.price !== unit.price ||
            isBase !== (savedBaseUnitLabel === unit.label) ||
            isDefault !== (savedDefault === unit.label);
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: labels are user-editable and may collide or sit empty mid-edit, so they can't identify a row
              key={index}
              className={`space-y-1.5 rounded-lg border px-2.5 py-2 ${
                rowDirty ? "border-amber-400 bg-amber-50" : "border-line"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  value={unit.label}
                  onChange={(e) => onEditUnit(index, "label", e.target.value)}
                  placeholder="Unit name"
                  aria-label={`Unit ${index + 1} name`}
                  // Renaming the Base unit would move the Base marker, which is
                  // locked once movements exist (same rule as reassignment).
                  // Its price stays editable — a price correction isn't a
                  // reassignment.
                  disabled={isBase && hasMovements}
                  className={`${UNIT_INPUT} min-w-0 flex-1 font-medium ${
                    isBase && hasMovements ? "text-sub" : ""
                  }`}
                />
                {isBase && <span className="pill archived">Base</span>}
                {isDefault && <span className="pill new">Default</span>}
                {multiUnit && !isBase && (
                  <button
                    type="button"
                    onClick={() => onRemoveUnit(index)}
                    aria-label={`Remove "${unit.label}"`}
                    className="text-sub shrink-0 px-1 text-[18px] leading-none"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                {/* Not a <label>: in the Base-unit case there's no control to
                    bind to (the equivalent is a fixed 1), and the input carries
                    its own aria-label either way. */}
                <div className="flex items-center gap-1">
                  <span className="text-sub">=</span>
                  {isBase ? (
                    <span className="font-semibold">1</span>
                  ) : (
                    <input
                      type="number"
                      value={unit.baseEquivalent}
                      onChange={(e) =>
                        onEditUnit(index, "baseEquivalent", e.target.value)
                      }
                      aria-label={`How many ${baseUnitLabel} in one ${
                        unit.label || "unit"
                      }`}
                      className={`${UNIT_INPUT} w-16`}
                    />
                  )}
                  <span className="text-sub">{baseUnitLabel}</span>
                </div>
                <label className="flex items-center gap-1">
                  <span className="text-sub">₱</span>
                  <input
                    type="number"
                    value={unit.price}
                    onChange={(e) => onEditUnit(index, "price", e.target.value)}
                    aria-label={`Price per ${unit.label || "unit"}`}
                    className={`${UNIT_INPUT} w-20`}
                  />
                </label>
              </div>

              {multiUnit && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="base-unit"
                      checked={isBase}
                      disabled={hasMovements}
                      onChange={() => onChooseBase(unit.label)}
                      aria-label={`Make "${unit.label}" the Base unit`}
                    />
                    <span className={hasMovements ? "text-sub" : undefined}>
                      Base
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="default-unit"
                      checked={isDefault}
                      onChange={() => onChooseDefault(unit.label)}
                      aria-label={`Make "${unit.label}" the Default unit`}
                    />
                    <span>Default</span>
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {multiUnit && hasMovements && (
        <p className="text-sub mt-1.5 text-[12px]">
          Base unit is locked — this product already has movements. To base it
          on a different Unit, archive this product and recreate it.
        </p>
      )}

      <button
        type="button"
        onClick={onAddUnit}
        className="text-accent mt-2 text-[13px] font-semibold"
      >
        + Add unit
      </button>
    </div>
  );
}

/**
 * A form field that shows, in place, whether it's been edited but not saved:
 * an amber left rail, an "Edited" tag, the saved value struck through, and a
 * one-tap reset. When clean it renders as a plain labelled field, so a settled
 * product carries no marks at all. The label stays a real `<label htmlFor>`
 * when the field wraps a single input; the Units group, which has none, passes
 * no `htmlFor` and gets a plain caption instead.
 */
function DiffField({
  label,
  htmlFor,
  dirty,
  was,
  wasPrefix = "was",
  onReset,
  children,
}: {
  label: string;
  htmlFor?: string;
  dirty: boolean;
  was: string;
  wasPrefix?: string;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        dirty
          ? "rounded-r-lg border-l-[3px] border-amber-400 bg-amber-50/60 py-1.5 pl-2.5"
          : undefined
      }
    >
      <div className="mb-1 flex items-center gap-2">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sub text-[13px]">
            {label}
          </label>
        ) : (
          <span className="text-sub text-[13px]">{label}</span>
        )}
        {dirty && (
          <>
            <span className="rounded bg-amber-400 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-ink">
              Edited
            </span>
            <button
              type="button"
              onClick={onReset}
              className="text-sub ml-auto text-[12px] underline"
            >
              ↺ reset
            </button>
          </>
        )}
      </div>
      {children}
      {dirty && (
        <p className="text-sub mt-1 text-[12px]">
          {wasPrefix}: <span className="line-through">{was || "—"}</span>
        </p>
      )}
    </div>
  );
}

type OpenEntry =
  | { kind: "delivery"; entryId: Id<"deliveries"> }
  | { kind: "pullout"; entryId: Id<"pullouts"> }
  | { kind: "sale"; entryId: Id<"sales"> };

/**
 * Every `stockMovements` row for this product, newest first under day
 * headings — the answer to "why does it say N?" sitting directly under N.
 * Reuses the Movements tab's day-grouped windowed list so a year of history
 * renders as cheaply here as it does there. Every row is tappable, and
 * reopens the whole entry behind it rather than just this one line — an entry
 * the ledger holds two rows for is still one correction to make.
 */
function ProductLedger({
  productId,
  onOpenEntry,
}: {
  productId: Id<"products">;
  onOpenEntry: (entry: OpenEntry) => void;
}) {
  const rows = useQuery(api.stockMovements.listForProduct, { productId });

  return (
    <div className="space-y-2">
      <h3 className="text-sub text-[13px] font-semibold uppercase tracking-wide">
        Ledger
      </h3>
      <WindowedDayList
        rows={rows ?? []}
        headerH={LEDGER_HEADER_H}
        rowH={LEDGER_ROW_H}
        viewportH={LEDGER_VIEWPORT_H}
        empty={rows === undefined ? "Loading…" : "No movements yet"}
        renderRow={(row) => (
          <LedgerRowView row={row} onOpen={openEntryFor(row, onOpenEntry)} />
        )}
      />
    </div>
  );
}

/**
 * The tap handler for one ledger row. Every row has an entry behind it, so
 * every row opens something. `row.refId`'s declared type spans all three
 * header tables regardless of `row.type`; narrowing it to the one table
 * `type` actually names is a cast rather than something the schema ties
 * together, since `stockMovements`' `type` and `refId` fields are validated
 * independently (see schema.ts).
 */
function openEntryFor(
  row: LedgerRow,
  onOpenEntry: (entry: OpenEntry) => void,
): () => void {
  const refId = row.refId;
  switch (row.type) {
    case "delivery":
      return () =>
        onOpenEntry({ kind: "delivery", entryId: refId as Id<"deliveries"> });
    case "pullout":
      return () =>
        onOpenEntry({ kind: "pullout", entryId: refId as Id<"pullouts"> });
    case "sale":
      return () => onOpenEntry({ kind: "sale", entryId: refId as Id<"sales"> });
  }
}

function ledgerContext(row: LedgerRow): string | null {
  if (row.type === "sale" && row.lineTotal !== undefined) {
    return `₱${row.lineTotal.toFixed(2)}`;
  }
  if (row.type === "pullout" && row.reasonCategory) {
    return row.reasonNotes
      ? `${row.reasonCategory} — ${row.reasonNotes}`
      : row.reasonCategory;
  }
  if (row.type === "delivery") return row.supplierName ?? "No supplier";
  return null;
}

function LedgerRowView({
  row,
  onOpen,
}: {
  row: LedgerRow;
  onOpen?: () => void;
}) {
  const context = ledgerContext(row);
  const changeColor =
    row.netChange > 0
      ? "text-accent"
      : row.netChange < 0
        ? "text-danger"
        : "text-sub";

  const content = (
    <>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold">
          {LEDGER_LABEL[row.type]}
        </div>
        <div className="text-sub truncate text-[11px]">
          {formatTime(row.createdAt)}
          {context ? ` · ${context}` : ""}
        </div>
      </div>
      <div className="shrink-0 pl-3 text-right">
        <div className={`font-bold ${changeColor}`}>
          {signed(row.netChange)}
        </div>
        <div className="text-sub text-[11px]">→ {row.runningBalance}</div>
      </div>
    </>
  );

  if (!onOpen) {
    return (
      <div className="flex h-full w-full items-center justify-between px-3">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex h-full w-full items-center justify-between px-3 text-left"
    >
      {content}
    </button>
  );
}
