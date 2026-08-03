"use client";

// PROTOTYPE ONLY — throwaway.
//
// VARIANT E — "The tab is a list of things that happened."
// Same day headings and windowing as D, but the row is the ENTRY, not the
// movement line: one row per delivery / pull-out / sale receipt, with its net
// change and product count. Tapping opens the grouped sheet. This is the shape
// that matches how the entries were logged — and the shape that can't show a
// running balance at all, because an entry spans several products.

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import {
  buildLedger,
  deltaColor,
  type Entry,
  entryLabel,
  entryTotal,
  formatTime,
  signed,
} from "../../../prototype/ledger";
import { WindowedDayList } from "../../../prototype/virtual";
import { EntrySheet } from "./EntrySheet";

const HEADER_H = 30;
const ROW_H = 54;
const VIEWPORT_H = 520;

type Filter = "manual" | "all" | "delivery" | "pullout";

type EntryRow = Entry & { quantity: number };

export function VariantE() {
  const products = useQuery(api.products.list, {});
  const ledger = useMemo(() => buildLedger(products ?? []), [products]);

  const [filter, setFilter] = useState<Filter>("manual");
  const [openEntry, setOpenEntry] = useState<Entry | null>(null);

  const rows = useMemo<EntryRow[]>(
    () =>
      ledger.entries
        .filter((e) => {
          if (filter === "all") return true;
          if (filter === "manual") return e.type !== "sale";
          return e.type === filter;
        })
        .map((e) => ({ ...e, quantity: entryTotal(e) })),
    [ledger, filter],
  );

  return (
    <main className="flex-1 p-3.5 space-y-3 pb-24">
      <h2 className="mt-1 text-lg font-semibold">Movements</h2>

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
            ["manual", "Deliveries & pull-outs"],
            ["delivery", "Deliveries"],
            ["pullout", "Pull-outs"],
            ["all", "Include sales"],
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
        renderRow={(e) => (
          <button
            type="button"
            onClick={() => setOpenEntry(e)}
            className="flex h-full w-full items-center justify-between px-3 text-left"
          >
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">
                {entryLabel(e)}
                <span className="text-sub ml-1">›</span>
              </div>
              <div className="text-sub truncate text-[11px]">
                {formatTime(e.createdAt)} · {e.lines.length} product
                {e.lines.length === 1 ? "" : "s"} ·{" "}
                {e.lines.map((l) => l.productName).join(", ")}
              </div>
            </div>
            <div
              className="shrink-0 pl-3 text-right font-bold"
              style={{ color: deltaColor(e.quantity) }}
            >
              {signed(e.quantity)}
            </div>
          </button>
        )}
      />

      <p className="text-sub text-[11px] leading-snug">
        No running-balance column — an entry spans several products, so there is
        no single stock figure to carry down the page.
      </p>

      {openEntry && (
        <EntrySheet entry={openEntry} onClose={() => setOpenEntry(null)} />
      )}
    </main>
  );
}
