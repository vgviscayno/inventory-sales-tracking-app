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
import { ReadingLadderField } from "../ReadingLadderField";

// This type derives from the query and does not restate it. A new field, or a
// new stock status, therefore reaches this form. Nobody has to widen a type
// here.
type Product = NonNullable<FunctionReturnType<typeof api.products.get>>;

// A Unit under edit. The draft holds strings, so a number field sits empty or
// half-typed during the edit. The save parses the strings back to numbers.
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

  // The saved values. Every render derives them fresh from the live product.
  // A successful save updates the `product` query, so these values follow it.
  // The dirty marks below then clear on their own. There is no remount and no
  // manual resync.
  const savedName = product.name;
  const savedUnits = toDrafts(product.units);
  const savedBaseUnitLabel = product.baseUnitLabel;
  // The form tracks this only for a product with several Units. A product with
  // one Unit has nothing to choose. That Unit is already the Base unit and the Default unit.
  // The picker below never appears, and this value stays null.
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
  // The Reading ladder, held as the set of ticked labels. The draft keeps no
  // order, because nothing reads one. `buildReadingLadder` sorts by descending
  // Base equivalent, whatever the order of the ticks.
  const [denominationLabels, setDenominationLabels] = useState<string[]>(
    savedDenominationLabels,
  );
  const [saving, setSaving] = useState(false);
  // The mutation refuses some edits, and a locked Base unit is the first of
  // them. Those refusals are the point of the edit, so a rejected save shows
  // its reason. It never does nothing in silence.
  const [saveError, setSaveError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  // This confirm appears only when the product still holds stock. See
  // `handleArchive`.
  // Nothing blocks Archive. This confirm only shows the count first. It does
  // not gate the action.
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Delete is one way, so it takes the same two-tap confirm as Archive. The
  // button is already disabled until the count is zero.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isArchived = product.archivedAt != null;
  // How this product's quantity reads everywhere on this screen. One
  // resolution serves the field, the delete gate, and the Archive confirm. No
  // two of them therefore show different Denominations at once. See
  // "Remainder reading" in CONTEXT.md.
  const formattedQuantity = formatStock(product);
  // A mirror of the server gate. See `products.remove`. What the button shows
  // and what it may do therefore always agree.
  const deleteBlockedReason =
    product.quantityOnHand === 0
      ? null
      : product.quantityOnHand > 0
        ? `${formattedQuantity} still on hand — pull them out first`
        : `${formattedQuantity} on hand — recount to fix before deleting`;
  // Which Entry a tap on a Ledger row opened. Every row carries a `refId`, so
  // every row opens something. This holds null only while nothing is open.
  const [openEntry, setOpenEntry] = useState<
    | { kind: "delivery"; entryId: Id<"deliveries"> }
    | { kind: "pullout"; entryId: Id<"pullouts"> }
    | { kind: "sale"; entryId: Id<"sales"> }
    | null
  >(null);

  // What the edit changed and the save has not yet committed. Each dirty field
  // flags itself in the form below. It takes an amber rail, a "was …" line, and
  // a reset control. The Save button carries the count.
  // A commit therefore always needs a visible tap. This matters most for a
  // Default unit swap, which otherwise looks identical once selected.
  const nameDirty = name !== savedName;
  const unitsDirty =
    JSON.stringify(units) !== JSON.stringify(savedUnits) ||
    baseUnitLabel !== savedBaseUnitLabel;
  const defaultDirty = defaultUnitLabel !== savedDefault;
  const thresholdDirty = lowStockThreshold !== savedThreshold;
  // This compares the two ladders as sets. Which Units sit on the ladder is the
  // whole of the choice. Two boxes ticked in the other order are not an edit.
  const readingDirty = !sameLabels(denominationLabels, savedDenominationLabels);
  const dirtyCount = [
    nameDirty,
    unitsDirty,
    defaultDirty,
    thresholdDirty,
    readingDirty,
  ].filter(Boolean).length;
  const isDirty = dirtyCount > 0;

  // The Base unit's Base equivalent is fixed at 1. The form parses it and
  // never accepts it as input.
  // The other checks mirror `validateUnits` on the server, so Save appears only
  // when the mutation accepts the list. The throw is still the guarantee. This
  // check only saves a round trip to learn the obvious.
  const parsedUnits = units.map((u) => ({
    label: u.label.trim(),
    baseEquivalent: Number(u.baseEquivalent),
    price: Number(u.price),
  }));
  // The Base marker and the Default marker name a Unit by its label. The save
  // trims every label on the way to the server, so the markers take the same
  // trim. A stray space otherwise makes the Base unit look absent. Save then
  // greys out, or the mutation rejects a list that is really fine.
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

  // The boxes to offer. The reading itself answers this, and the form does not
  // re-derive it. The form must never offer a Denomination that
  // `buildReadingLadder` drops.
  // The answer comes from the drafts and not from the saved product. A tick
  // therefore works on a Unit that this same unsaved edit added, renamed, or
  // re-scaled.
  // A product with no coarser Unit never gets the selector. Its reading is the
  // plain one either way.
  const denominations = selectableDenominations({
    units: parsedUnits,
    baseUnitLabel: baseUnitTrimmed,
  });
  // The reading this edit gives once saved, over the stock on hand.
  // A product that holds nothing has no figure worth a preview. A negative
  // count has none either, because it always reads plainly. One of the coarsest
  // Denomination plus one Base unit then stands in.
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

  // An edit to a Unit's label drags the Base marker and the Default marker
  // with it. Both markers name a Unit by its label. A rename of the Base unit
  // otherwise points the marker at a label that no longer exists.
  function editUnit(index: number, field: keyof UnitDraft, value: string) {
    const old = units[index];
    setUnits(units.map((u, i) => (i === index ? { ...u, [field]: value } : u)));
    if (field === "label") {
      if (old.label === baseUnitLabel) setBaseUnitLabel(value);
      if (old.label === defaultUnitLabel) setDefaultUnitLabel(value);
      // The ladder names its Denominations by label too, so a rename drags them
      // with it. The Denomination otherwise drops off the reading in silence.
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
    // A removed Default unit falls back to the Base unit. The server agrees.
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
        // The save sends this only when the Base unit moves. It reads a changed
        // Base unit as a reassignment, and locks that behind "no Movements". An
        // unchanged Base unit must not trip the lock, and neither must one that
        // differs only by trimmed whitespace.
        ...(unitsDirty && baseUnitTrimmed !== savedBaseUnitLabel
          ? { baseUnitLabel: baseUnitTrimmed }
          : {}),
        ...(defaultDirty
          ? { defaultUnitLabel: defaultUnitLabel?.trim() ?? null }
          : {}),
        lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : null,
        ...(readingDirty ? { denominationLabels } : {}),
      });
      // Set the local drafts to exactly what the reactive query hands back.
      // Every dirty mark then clears. Nothing relies on the typed strings
      // matching the saved round trip by chance.
      // Two mismatches otherwise leave the Units group amber for good. A price
      // typed "10.50" stores as 10.5 and comes back as "10.5". A stray space in
      // a label never equals `savedUnits`.
      // An unset Default unit also follows the Base unit in `savedDefault`. A
      // reassigned Base unit therefore moves the saved Default unit. So does a
      // Unit that takes the count from 1 to 2. The local Default unit does not
      // move with it.
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
      // The Default unit's resulting stored value. It is what the save sent if
      // the Default unit moved. Otherwise it is the product's own value, unless
      // this edit removed that Unit, which the mutation clears. See
      // `products.update`.
      // The resolution then follows `withStatus`: an unset Default unit falls
      // back to the Base unit. The value therefore lands on the same label the
      // refreshed `savedDefault` carries.
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

  // Only a product that still holds stock needs a look before Archive. A
  // product with nothing on hand has nothing to warn about, and archives on the
  // first tap.
  // Nothing refuses Archive either way. The confirm only shows the count before
  // it leaves the grid.
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

  // Delete has no undo, so the move away is part of the action. This page has
  // nothing left to show once the product leaves every list that links back to
  // it.
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
            {/* Saved Units, so a label is settled enough to key a tick by. */}
            <ReadingLadderField
              items={denominations.map((unit) => ({
                key: unit.label,
                label: unit.label,
                checked: denominationLabels.includes(unit.label),
              }))}
              baseUnitLabel={baseUnitTrimmed}
              preview={readingPreview}
              previewIsExample={product.quantityOnHand <= 0}
              onToggle={toggleDenomination}
            />
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
 * the comparison. The reading sorts its own Denominations. See
 * `buildReadingLadder`. The same two boxes ticked in the other order therefore
 * change nothing to save.
 */
function sameLabels(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const inB = new Set(b);
  return a.every((label) => inB.has(label));
}

// An edited input takes an amber border and ring. The change stays visible
// when the field scrolls past its label.
function fieldInputClass(dirty: boolean): string {
  return `${FIELD_INPUT_BASE} ${
    dirty ? "border-amber-400 ring-1 ring-amber-300" : "border-line"
  }`;
}

const UNIT_INPUT =
  "rounded-[8px] border border-line bg-card px-2 py-1.5 text-[14px]";

/**
 * The Units of a product, all editable in place. Each Unit carries a label, a
 * Base equivalent, and a price. The Base equivalent is fixed at 1 and read-only
 * for the Base unit. Two markers sit beside the list: which Unit is the Base
 * unit, and which Unit leads as the Default unit.
 * To add a Unit and to drop a Unit are edits to the same list. A correction
 * that adds a tray to eggs therefore stays on this screen. So does the drop of
 * a Unit the shop has stopped selling.
 *
 * Two refusals live on the server. See `products.update`. This form mirrors
 * them as affordances and never as the guarantee. The Base unit has no remove
 * control. The Base radios go disabled once the product has Movements, with the
 * reason spelt out. The mutation still throws either way, and that throw
 * appears below the Save button.
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
                  // A rename of the Base unit moves the Base marker, which
                  // locks once Movements exist. This is the rule that governs a
                  // reassignment. The price stays editable, because a price
                  // correction is not a reassignment.
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
 * A form field that shows in place whether an edit has reached it and the save
 * has not. It carries an amber left rail, an "Edited" tag, the saved value
 * struck through, and a one-tap reset. A clean field renders as a plain
 * labelled field, so a settled product carries no marks at all.
 * The label stays a real `<label htmlFor>` when the field wraps one input. The
 * Units group wraps no single input. It passes no `htmlFor` and takes a plain
 * caption instead.
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
 * headings. It answers "why does it say N?" directly under the N.
 * This list reuses the day-grouped windowed list from the Movements tab. A
 * year of history therefore renders as cheaply here as it does there.
 * Every row takes a tap, and the tap reopens the whole Entry behind it and not
 * the one Line. An Entry the Ledger holds two rows for is still one correction
 * to make.
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
 * The tap handler for one Ledger row. Every row has an Entry behind it, so
 * every row opens something.
 * The declared type of `row.refId` spans all three header tables, whatever
 * `row.type` holds. To narrow it to the one table `type` names takes a cast.
 * The schema validates `type` and `refId` independently and ties neither to the
 * other. See schema.ts.
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
