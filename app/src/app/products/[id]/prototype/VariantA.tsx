"use client";

// PROTOTYPE ONLY — throwaway.
//
// VARIANT A (rev 2) — "The product page is the ledger."
// One surface only: a full audit trail on the product detail page, showing
// EVERY movement type (sale, delivery, pull-out, opening) with a running
// balance, so "why does it say 7?" is answered where the number is shown.
// No global feed. Editing reopens the WHOLE grouped entry in a checkout-style
// sheet — including its lines for other products.
//
// rev 2, per review: rows adopt Variant C's compact layout (event, signed
// delta, running balance), the list is grouped under per-day headings, and it
// is windowed (see ../../../../prototype/virtual).

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  deltaColor,
  type Entry,
  formatDate,
  formatTime,
  type Ledger,
  type Movement,
  movementLabel,
  type ProductLike,
  REASON_LABELS,
  signed,
  withRunningBalance,
} from "../../../../prototype/ledger";
import { WindowedDayList } from "../../../../prototype/virtual";

const HEADER_H = 30;
const ROW_H = 46;
const VIEWPORT_H = 400;

export function VariantA({
  product,
  ledger,
}: {
  product: ProductLike & { lowStockStatus: "low" | "ok" };
  ledger: Ledger;
}) {
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);

  const rows = useMemo(
    () =>
      withRunningBalance(
        ledger.movements.filter((m) => m.productId === product._id),
      ),
    [ledger, product._id],
  );

  return (
    <main className="flex-1 p-3.5 space-y-3 pb-24">
      <Link href="/products" className="mb-1 inline-block text-xl">
        &larr;
      </Link>

      <div className="card p-3">
        <h2 className="text-lg font-semibold">{product.name}</h2>
        <div className="mt-2 text-[28px] font-bold leading-none">
          {product.quantityOnHand}
        </div>
        <div className="text-sub mt-1 text-[13px]">
          in stock · ₱{product.sellingPrice.toFixed(2)} each
          {product.lowStockStatus === "low" && (
            <span className="pill utang ml-2">low</span>
          )}
        </div>
      </div>

      <form className="card space-y-2.5 p-3">
        <div>
          <label htmlFor="a-name" className="text-sub block text-[13px] mb-1">
            Name
          </label>
          <input
            id="a-name"
            defaultValue={product.name}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <div>
          <label htmlFor="a-price" className="text-sub block text-[13px] mb-1">
            Selling price
          </label>
          <input
            id="a-price"
            type="number"
            defaultValue={product.sellingPrice}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <p className="text-sub text-[12px] leading-snug">
          Qty on hand is no longer edited here — it&apos;s the sum of the
          movements below. To change it, log a delivery or a pull-out.
        </p>
        <button
          type="button"
          className="w-full rounded-xl bg-accent py-2.5 font-bold text-accent-ink"
        >
          Save Changes
        </button>
      </form>

      <h3 className="mt-4 mb-1 text-sm font-semibold">Stock history</h3>
      <p className="text-sub text-[12px]">
        Every movement, newest first. Tap a delivery or pull-out to edit it.
      </p>

      <WindowedDayList
        rows={rows}
        headerH={HEADER_H}
        rowH={ROW_H}
        viewportH={VIEWPORT_H}
        renderRow={(m) => {
          const editable = m.type === "delivery" || m.type === "pullout";
          const entry = m.refId ? ledger.entryById.get(m.refId) : undefined;
          return (
            <button
              type="button"
              disabled={!editable}
              onClick={() => entry && setOpenEntry(entry)}
              className={`flex h-full w-full items-center justify-between px-3 text-left ${
                editable ? "" : "cursor-default"
              }`}
            >
              <div className="min-w-0">
                <div className="truncate text-[14px]">
                  {movementLabel(m)}
                  {editable && <span className="text-sub ml-1">›</span>}
                </div>
                <div className="text-sub truncate text-[11px]">
                  {formatTime(m.createdAt)}
                  {m.type === "delivery" && entry?.supplier
                    ? ` · ${entry.supplier}`
                    : ""}
                  {m.type === "sale" && m.unitPriceAtSale
                    ? ` · ₱${(Math.abs(m.quantity) * m.unitPriceAtSale).toFixed(2)}`
                    : ""}
                  {m.reasonNotes ? ` · ${m.reasonNotes}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-baseline gap-3 pl-3">
                <span
                  className="w-9 text-right font-semibold"
                  style={{ color: deltaColor(m.quantity) }}
                >
                  {signed(m.quantity)}
                </span>
                <span className="text-sub w-9 text-right text-[13px]">
                  {m.balance}
                </span>
              </div>
            </button>
          );
        }}
      />

      {openEntry && (
        <EntrySheet
          entry={openEntry}
          focusProductId={product._id}
          onClose={() => setOpenEntry(null)}
        />
      )}
    </main>
  );
}

/**
 * The grouped-edit unit: the whole delivery/pull-out reopened in the same
 * bottom sheet used to log it (ticket 03's Variant A). Note it can contain
 * lines for products you didn't come from — that's the cost of grouped edit.
 */
function EntrySheet({
  entry,
  focusProductId,
  onClose,
}: {
  entry: Entry;
  focusProductId: string;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Movement[]>(entry.lines);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function bump(id: string, by: number) {
    setLines((ls) =>
      ls.map((l) =>
        l._id === id
          ? {
              ...l,
              quantity:
                l.quantity > 0
                  ? Math.max(1, l.quantity + by)
                  : Math.min(-1, l.quantity - by),
            }
          : l,
      ),
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40">
      <div className="max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl bg-bg p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">
            {entry.type === "delivery" ? "Edit delivery" : "Edit pull-out"}
          </h3>
          <button type="button" onClick={onClose} className="text-sub text-xl">
            ×
          </button>
        </div>
        <div className="text-sub mb-3 text-[12px]">
          {entry.type === "delivery"
            ? `${entry.supplier} · logged ${formatDate(entry.createdAt)}`
            : `logged ${formatDate(entry.createdAt)}`}
        </div>

        <div className="space-y-2">
          {lines.map((l) => (
            <div
              key={l._id}
              className={`card p-2.5 ${
                l.productId === focusProductId ? "border-accent" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">
                    {l.productName}
                  </div>
                  {l.productId !== focusProductId && (
                    <div className="text-sub text-[11px]">
                      also in this entry
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => bump(l._id, -1)}
                    className="card h-8 w-8 text-lg leading-none"
                  >
                    −
                  </button>
                  <span className="w-8 text-center font-semibold">
                    {Math.abs(l.quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => bump(l._id, 1)}
                    className="card h-8 w-8 text-lg leading-none"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setLines((ls) => ls.filter((x) => x._id !== l._id))
                    }
                    className="text-danger px-1 text-lg leading-none"
                    aria-label={`Remove ${l.productName}`}
                  >
                    ×
                  </button>
                </div>
              </div>
              {entry.type === "pullout" && (
                <div className="text-sub mt-1.5 text-[12px]">
                  {l.reasonCategory ? REASON_LABELS[l.reasonCategory] : "—"}
                  {l.reasonNotes ? ` · ${l.reasonNotes}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            console.log("[prototype] save entry", entry._id, lines);
            onClose();
          }}
          className="mt-3 w-full rounded-xl bg-accent py-3 font-bold text-accent-ink"
        >
          Save Changes
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            console.log("[prototype] delete entry", entry._id);
            onClose();
          }}
          className={`mt-2 w-full rounded-xl border py-2.5 font-semibold ${
            confirmDelete
              ? "bg-danger border-danger text-white"
              : "text-danger border-line"
          }`}
        >
          {confirmDelete
            ? "Confirm — delete whole entry"
            : "Delete whole entry"}
        </button>
      </div>
    </div>
  );
}
