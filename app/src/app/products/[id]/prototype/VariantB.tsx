"use client";

// PROTOTYPE ONLY — throwaway.
//
// VARIANT B — "Movements is its own place."
// The product page stays thin: a stock figure and one link out. The real
// surface is a global, reverse-chronological feed of GROUPED ENTRIES (a mocked
// 4th nav tab), scoped to manually-logged deliveries and pull-outs only —
// sales already have Register and the customer profile. Editing happens on the
// entry card, in the feed, never on the product page.

import Link from "next/link";
import { useState } from "react";
import {
  deltaColor,
  type Entry,
  entryLabel,
  entryTotal,
  formatDateTime,
  type Ledger,
  type ProductLike,
  REASON_LABELS,
  signed,
} from "../../../../prototype/ledger";

type Filter = "all" | "delivery" | "pullout";

export function VariantB({
  product,
  ledger,
}: {
  product: ProductLike & { lowStockStatus: "low" | "ok" };
  ledger: Ledger;
}) {
  const [feedOpen, setFeedOpen] = useState(false);

  const involving = ledger.entries.filter(
    (e) =>
      e.type !== "sale" && e.lines.some((l) => l.productId === product._id),
  ).length;

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

      <button
        type="button"
        onClick={() => setFeedOpen(true)}
        className="card flex w-full items-center justify-between px-3 py-3 text-left"
      >
        <div>
          <div className="font-semibold">Stock movements</div>
          <div className="text-sub text-[13px]">
            {involving} deliveries &amp; pull-outs involve this product
          </div>
        </div>
        <span className="text-sub text-lg">›</span>
      </button>

      <form className="card space-y-2.5 p-3">
        <div>
          <label htmlFor="b-name" className="text-sub block text-[13px] mb-1">
            Name
          </label>
          <input
            id="b-name"
            defaultValue={product.name}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <div>
          <label htmlFor="b-price" className="text-sub block text-[13px] mb-1">
            Selling price
          </label>
          <input
            id="b-price"
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
        <MovementsFeed
          ledger={ledger}
          product={product}
          onClose={() => setFeedOpen(false)}
        />
      )}
    </main>
  );
}

/** Full-screen panel standing in for a 4th "Movements" nav tab. */
function MovementsFeed({
  ledger,
  product,
  onClose,
}: {
  ledger: Ledger;
  product: ProductLike;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [thisProductOnly, setThisProductOnly] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entry | null>(null);

  const entries = ledger.entries.filter((e) => {
    if (e.type === "sale") return false; // sales are not in this feed
    if (filter !== "all" && e.type !== filter) return false;
    if (thisProductOnly && !e.lines.some((l) => l.productId === product._id))
      return false;
    return true;
  });

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-bg">
      <div className="mx-auto max-w-[480px] p-3.5 pb-24">
        {/* mocked nav — this variant adds a 4th tab */}
        <nav className="mb-3 flex gap-2">
          {["Register", "Products", "Customers", "Movements"].map((t) => (
            <span
              key={t}
              className={`flex-1 rounded-xl py-2.5 text-center text-[13px] font-semibold ${
                t === "Movements" ? "bg-accent text-accent-ink" : "card"
              }`}
            >
              {t}
            </span>
          ))}
        </nav>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Stock movements</h2>
          <button type="button" onClick={onClose} className="text-sub text-xl">
            ×
          </button>
        </div>

        <div className="mb-2 flex gap-2">
          {(
            [
              ["all", "All"],
              ["delivery", "Deliveries"],
              ["pullout", "Pull-outs"],
            ] as [Filter, string][]
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

        <div className="space-y-2">
          {entries.map((e) => {
            const open = expanded === e._id;
            const total = entryTotal(e);
            return (
              <div key={e._id} className="card p-3">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : e._id)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <div className="min-w-0">
                    <div className="font-semibold">{entryLabel(e)}</div>
                    <div className="text-sub text-[12px]">
                      {formatDateTime(e.createdAt)} · {e.lines.length} product
                      {e.lines.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div
                    className="shrink-0 pl-3 text-right font-bold"
                    style={{ color: deltaColor(total) }}
                  >
                    {signed(total)}
                  </div>
                </button>

                {open && (
                  <>
                    <div className="mt-2 border-t border-line pt-2">
                      {e.lines.map((l) => (
                        <div
                          key={l._id}
                          className="flex justify-between py-1 text-[13px]"
                        >
                          <span
                            className={
                              l.productId === product._id ? "font-semibold" : ""
                            }
                          >
                            {l.productName}
                            {e.type === "pullout" && l.reasonCategory && (
                              <span className="text-sub">
                                {" "}
                                · {REASON_LABELS[l.reasonCategory]}
                              </span>
                            )}
                          </span>
                          <span style={{ color: deltaColor(l.quantity) }}>
                            {signed(l.quantity)}
                          </span>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditing(e)}
                      className="mt-2 w-full rounded-xl border border-line py-2 text-[14px] font-semibold"
                    >
                      Edit this entry
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {entries.length === 0 && (
            <p className="text-sub py-10 text-center">Nothing logged yet</p>
          )}
        </div>
      </div>

      {editing && (
        <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function EditEntrySheet({
  entry,
  onClose,
}: {
  entry: Entry;
  onClose: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
      <div className="max-h-[85vh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl bg-bg p-3.5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">{entryLabel(entry)}</h3>
          <button type="button" onClick={onClose} className="text-sub text-xl">
            ×
          </button>
        </div>
        <p className="text-sub mb-3 text-[12px]">
          Reopens the same sheet used to log it — the whole entry is the unit.
        </p>
        <div className="space-y-2">
          {entry.lines.map((l) => (
            <div
              key={l._id}
              className="card flex items-center justify-between p-2.5"
            >
              <span className="text-[14px] font-semibold">{l.productName}</span>
              <input
                type="number"
                defaultValue={Math.abs(l.quantity)}
                className="w-16 rounded-[10px] border border-line bg-card px-2 py-1.5 text-center text-[15px]"
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            console.log("[prototype] save entry", entry._id);
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
          {confirmDelete ? "Confirm — delete entry" : "Delete entry"}
        </button>
      </div>
    </div>
  );
}
