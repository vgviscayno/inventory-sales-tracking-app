"use client";

// PROTOTYPE ONLY — throwaway.
//
// VARIANT D — "The tab is one flat ledger."
// Variant A's row layout promoted to a global surface: every movement across
// every product, newest first, under the same per-day headings, windowed.
// The row leads with the PRODUCT (the thing that varies globally) and keeps the
// signed delta + that product's running balance in the same fixed columns.

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import {
  buildLedger,
  deltaColor,
  type Entry,
  formatTime,
  type Movement,
  movementLabel,
  signed,
  withRunningBalance,
} from "../../../prototype/ledger";
import { WindowedDayList } from "../../../prototype/virtual";
import { EntrySheet } from "./EntrySheet";

const HEADER_H = 30;
const ROW_H = 50;
const VIEWPORT_H = 520;

type Filter = "all" | "manual" | "delivery" | "pullout" | "sale";

export function VariantD() {
  const products = useQuery(api.products.list, {});
  const ledger = useMemo(() => buildLedger(products ?? []), [products]);

  const [filter, setFilter] = useState<Filter>("all");
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);

  // Running balance is per-product, so it has to be computed per product and
  // only then merged back into one global stream — a real cost of this shape.
  const rows = useMemo(() => {
    const byProduct = new Map<string, Movement[]>();
    for (const m of ledger.movements) {
      const list = byProduct.get(m.productId) ?? [];
      list.push(m);
      byProduct.set(m.productId, list);
    }
    const all = [...byProduct.values()].flatMap((ms) => withRunningBalance(ms));
    return all
      .filter((m) => {
        if (filter === "all") return true;
        if (filter === "manual")
          return m.type === "delivery" || m.type === "pullout";
        return m.type === filter;
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [ledger, filter]);

  return (
    <main className="flex-1 p-3.5 space-y-3 pb-24">
      <h2 className="mt-1 text-lg font-semibold">Movements</h2>

      {/* A tab is also a natural home for the logging entry point — which
          competes with ticket 03's floating pills over the Products page. */}
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-xl bg-accent py-2.5 font-semibold text-accent-ink"
        >
          + Delivery
        </button>
        <button type="button" className="card flex-1 py-2.5 font-semibold">
          − Pull-out
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["all", "All"],
            ["manual", "Deliveries & pull-outs"],
            ["delivery", "Deliveries"],
            ["pullout", "Pull-outs"],
            ["sale", "Sales"],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
              filter === value ? "bg-ink text-bg" : "card"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <WindowedDayList
        rows={rows}
        headerH={HEADER_H}
        rowH={ROW_H}
        viewportH={VIEWPORT_H}
        empty="Nothing logged yet"
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
                <div className="truncate text-[14px] font-semibold">
                  {m.productName}
                  {editable && <span className="text-sub ml-1">›</span>}
                </div>
                <div className="text-sub truncate text-[11px]">
                  {movementLabel(m)} · {formatTime(m.createdAt)}
                  {m.type === "delivery" && entry?.supplier
                    ? ` · ${entry.supplier}`
                    : ""}
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

      <p className="text-sub text-[11px] leading-snug">
        Right-hand number is that product&apos;s stock after the movement — true
        per row, but it no longer reads as a column you can follow down the
        page.
      </p>

      {openEntry && (
        <EntrySheet entry={openEntry} onClose={() => setOpenEntry(null)} />
      )}
    </main>
  );
}
