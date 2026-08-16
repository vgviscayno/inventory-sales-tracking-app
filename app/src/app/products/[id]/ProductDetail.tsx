"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatTime, signed } from "../../format";
import { DeliverySheet } from "../../movements/DeliverySheet";
import { PulloutSheet } from "../../movements/PulloutSheet";
import { SaleEntrySheet } from "../../movements/SaleEntrySheet";
import { StockStatusPill } from "../../StockStatusPill";
import { WindowedDayList } from "../../WindowedDayList";

// Derived from the query rather than restated, so a new field — or a new stock
// status — reaches this form without anyone remembering to widen a type here.
type Product = NonNullable<FunctionReturnType<typeof api.products.get>>;

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
  // Only tracked for a multi-Unit product — a single-Unit one has nothing to
  // choose (its one Unit is already both Base and Default), so it never gets
  // offered the picker below, and this stays null.
  const savedUnit = product.units.length > 1 ? product.defaultUnit.label : null;
  const savedThreshold =
    product.lowStockThreshold != null ? String(product.lowStockThreshold) : "";

  const [name, setName] = useState(savedName);
  const [defaultUnitLabel, setDefaultUnitLabel] = useState<string | null>(
    savedUnit,
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(savedThreshold);
  const [saving, setSaving] = useState(false);
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
  // Mirrors the server's gate (see `products.remove`) so what the button
  // shows and what it's actually allowed to do never disagree.
  const deleteBlockedReason =
    product.quantityOnHand === 0
      ? null
      : product.quantityOnHand > 0
        ? `${product.quantityOnHand} still on hand — pull them out first`
        : `${product.quantityOnHand} on hand — recount to fix before deleting`;
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
  const unitDirty = defaultUnitLabel !== null && defaultUnitLabel !== savedUnit;
  const thresholdDirty = lowStockThreshold !== savedThreshold;
  const dirtyCount = [nameDirty, unitDirty, thresholdDirty].filter(
    Boolean,
  ).length;
  const isDirty = dirtyCount > 0;

  const canSave = name.trim().length > 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    await updateProduct({
      id: product._id,
      name: name.trim(),
      ...(defaultUnitLabel !== null ? { defaultUnitLabel } : {}),
      lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : null,
    });
    setSaving(false);
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
            {product.quantityOnHand} {product.baseUnitLabel}
          </div>
        </div>
        <Link href="/movements" className="text-accent block text-[13px]">
          Log a delivery to change this count →
        </Link>
        <DiffField
          label="Units"
          dirty={unitDirty}
          was={savedUnit ?? ""}
          wasPrefix="Default was"
          onReset={() => setDefaultUnitLabel(savedUnit)}
        >
          {product.units.length > 1 && (
            <p className="text-sub text-[13px] mb-1.5">
              Default unit — the one its listed price is quoted in and the
              Register preselects.
            </p>
          )}
          <div className="space-y-1">
            {product.units.map((unit) => {
              const isDefault = defaultUnitLabel === unit.label;
              // Only the picked-but-unsaved default gets the amber row, so the
              // one line she'd otherwise miss is the one that stands out.
              const rowDirty = unitDirty && isDefault;
              return (
                <div
                  key={unit.label}
                  className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-[14px] ${
                    rowDirty ? "border-amber-400 bg-amber-50" : "border-line"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {product.units.length > 1 && (
                      <input
                        type="radio"
                        name="default-unit"
                        checked={isDefault}
                        onChange={() => setDefaultUnitLabel(unit.label)}
                        aria-label={`Make "${unit.label}" the Default unit`}
                      />
                    )}
                    {unit.label}
                    {unit.label === product.baseUnitLabel && (
                      <span className="pill archived ml-1.5">Base</span>
                    )}
                    {isDefault && (
                      <span className="pill new ml-1.5">Default</span>
                    )}
                    {unit.baseEquivalent !== 1 && (
                      <span className="text-sub">
                        {" "}
                        = {unit.baseEquivalent} {product.baseUnitLabel}
                      </span>
                    )}
                  </span>
                  <span className="font-semibold">
                    ₱{unit.price.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
        </DiffField>
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
                ? `Confirm Archive (${product.quantityOnHand} in stock)`
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

// An edited input gets an amber border + ring so the change is visible even
// with the field scrolled past its label.
function fieldInputClass(dirty: boolean): string {
  return `${FIELD_INPUT_BASE} ${
    dirty ? "border-amber-400 ring-1 ring-amber-300" : "border-line"
  }`;
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
