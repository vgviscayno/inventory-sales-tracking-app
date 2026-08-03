"use client";

// PROTOTYPE ONLY — throwaway.
//
// VARIANT C — "Both surfaces, and the LINE is the unit."
// The product page carries a compact ledger strip (all types, running balance,
// truncated), and there is also a global feed — but the feed is FLAT: one row
// per movement line, not grouped by entry, because a correction is almost
// always about one product's number being wrong. Editing happens inline on the
// row; no sheet is reopened.

import Link from "next/link";
import { useState } from "react";
import {
  deltaColor,
  formatDate,
  formatDateTime,
  type Ledger,
  type Movement,
  movementLabel,
  type ProductLike,
  REASON_LABELS,
  type ReasonCategory,
  signed,
  withRunningBalance,
} from "../../../../prototype/ledger";

const STRIP_ROWS = 5;

export function VariantC({
  product,
  ledger,
}: {
  product: ProductLike & { lowStockStatus: "low" | "ok" };
  ledger: Ledger;
}) {
  const [feedOpen, setFeedOpen] = useState(false);

  const rows = withRunningBalance(
    ledger.movements.filter((m) => m.productId === product._id),
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

        {/* the strip: enough to explain the number, not a full history */}
        <div className="mt-3 border-t border-line pt-2">
          {rows.slice(0, STRIP_ROWS).map((m) => (
            <div
              key={m._id}
              className="flex items-center justify-between py-1 text-[13px]"
            >
              <span className="text-sub">
                {formatDate(m.createdAt)} · {movementLabel(m)}
              </span>
              <span className="flex items-baseline gap-2">
                <span style={{ color: deltaColor(m.quantity) }}>
                  {signed(m.quantity)}
                </span>
                <span className="text-sub w-8 text-right">{m.balance}</span>
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <p className="text-sub py-2 text-[13px]">No movements yet</p>
          )}
          {rows.length > STRIP_ROWS && (
            <button
              type="button"
              onClick={() => setFeedOpen(true)}
              className="text-accent mt-1 text-[13px] font-semibold"
            >
              See all {rows.length} movements →
            </button>
          )}
        </div>
      </div>

      <form className="card space-y-2.5 p-3">
        <div>
          <label htmlFor="c-name" className="text-sub block text-[13px] mb-1">
            Name
          </label>
          <input
            id="c-name"
            defaultValue={product.name}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <div>
          <label htmlFor="c-price" className="text-sub block text-[13px] mb-1">
            Selling price
          </label>
          <input
            id="c-price"
            type="number"
            defaultValue={product.sellingPrice}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <button
          type="button"
          className="w-full rounded-xl bg-accent py-2.5 font-bold text-accent-ink"
        >
          Save Changes
        </button>
      </form>

      {feedOpen && (
        <FlatFeed
          ledger={ledger}
          product={product}
          onClose={() => setFeedOpen(false)}
        />
      )}
    </main>
  );
}

type TypeFilter = "all" | "delivery" | "pullout" | "sale";

function FlatFeed({
  ledger,
  product,
  onClose,
}: {
  ledger: Ledger;
  product: ProductLike;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [thisProductOnly, setThisProductOnly] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);

  const rows = ledger.movements.filter((m) => {
    if (filter !== "all" && m.type !== filter) return false;
    if (thisProductOnly && m.productId !== product._id) return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto max-w-[480px] p-3.5 pb-24">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">All movements</h2>
          <button type="button" onClick={onClose} className="text-sub text-xl">
            ×
          </button>
        </div>

        <div className="mb-2 flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["delivery", "Deliveries"],
              ["pullout", "Pull-outs"],
              ["sale", "Sales"],
            ] as [TypeFilter, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                filter === value ? "bg-ink text-bg" : "card"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="text-sub mb-3 flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={thisProductOnly}
            onChange={(e) => setThisProductOnly(e.target.checked)}
          />
          Only {product.name}
        </label>

        <div className="space-y-1.5">
          {rows.map((m) =>
            editingId === m._id ? (
              <InlineEditor
                key={m._id}
                movement={m}
                onDone={() => setEditingId(null)}
              />
            ) : (
              <button
                key={m._id}
                type="button"
                disabled={m.type === "sale" || m.type === "opening"}
                onClick={() => setEditingId(m._id)}
                className="card flex w-full items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">
                    {m.productName}
                  </div>
                  <div className="text-sub text-[12px]">
                    {movementLabel(m)} · {formatDateTime(m.createdAt)}
                  </div>
                </div>
                <div
                  className="shrink-0 pl-3 font-bold"
                  style={{ color: deltaColor(m.quantity) }}
                >
                  {signed(m.quantity)}
                </div>
              </button>
            ),
          )}
          {rows.length === 0 && (
            <p className="text-sub py-10 text-center">Nothing here</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** The whole point of C: correct one line where it sits, no sheet. */
function InlineEditor({
  movement,
  onDone,
}: {
  movement: Movement;
  onDone: () => void;
}) {
  const [qty, setQty] = useState(Math.abs(movement.quantity));
  const [reason, setReason] = useState<ReasonCategory | undefined>(
    movement.reasonCategory,
  );
  const [notes, setNotes] = useState(movement.reasonNotes ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const notesRequired = reason === "other" && !notes.trim();

  return (
    <div className="card border-accent space-y-2.5 p-3">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold">{movement.productName}</div>
        <button type="button" onClick={onDone} className="text-sub text-lg">
          ×
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sub text-[13px]">Qty</span>
        <button
          type="button"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          className="card h-9 w-9 text-lg leading-none"
        >
          −
        </button>
        <span className="w-10 text-center font-semibold">{qty}</span>
        <button
          type="button"
          onClick={() => setQty((q) => q + 1)}
          className="card h-9 w-9 text-lg leading-none"
        >
          +
        </button>
        <span className="text-sub ml-auto text-[12px]">
          was {Math.abs(movement.quantity)} · stock{" "}
          {signed(
            (qty - Math.abs(movement.quantity)) *
              (movement.quantity > 0 ? 1 : -1),
          )}
        </span>
      </div>

      {movement.type === "pullout" && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(REASON_LABELS) as ReasonCategory[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                  reason === r ? "bg-ink text-bg" : "card"
                }`}
              >
                {REASON_LABELS[r]}
              </button>
            ))}
          </div>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              reason === "other" ? "Notes (required)" : "Notes (optional)"
            }
            className={`w-full rounded-[10px] border bg-card px-2.5 py-2 text-[14px] ${
              notesRequired ? "border-danger" : "border-line"
            }`}
          />
        </>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true);
            console.log("[prototype] delete line", movement._id);
            onDone();
          }}
          className={`flex-1 rounded-xl border py-2 font-semibold ${
            confirmDelete
              ? "bg-danger border-danger text-white"
              : "text-danger border-line"
          }`}
        >
          {confirmDelete ? "Confirm delete" : "Delete line"}
        </button>
        <button
          type="button"
          disabled={notesRequired}
          onClick={() => {
            console.log("[prototype] save line", movement._id, { qty, reason });
            onDone();
          }}
          className="flex-1 rounded-xl bg-accent py-2 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
        >
          Save
        </button>
      </div>
    </div>
  );
}
