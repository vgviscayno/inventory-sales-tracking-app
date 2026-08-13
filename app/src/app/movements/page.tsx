"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatTime, signed } from "../format";
import { WindowedDayList } from "../WindowedDayList";
import { DeliverySheet } from "./DeliverySheet";
import { PulloutSheet } from "./PulloutSheet";
import { SaleEntrySheet } from "./SaleEntrySheet";
import { type TypeFilter, useMovementsFilter } from "./useMovementsFilter";

const HEADER_H = 30;
const ROW_H = 54;
const VIEWPORT_H = 520;

type Entry =
  | ({ kind: "delivery" } & ReturnType<typeof useDeliveries>[number])
  | ({ kind: "pullout" } & ReturnType<typeof usePullouts>[number])
  | ({ kind: "sale" } & ReturnType<typeof useSales>[number]);

function useDeliveries(enabled: boolean) {
  return useQuery(api.deliveries.list, enabled ? {} : "skip") ?? [];
}

function usePullouts(enabled: boolean) {
  return useQuery(api.pullouts.list, enabled ? {} : "skip") ?? [];
}

function useSales(enabled: boolean) {
  return useQuery(api.sales.list, enabled ? {} : "skip") ?? [];
}

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: "all", label: "Deliveries & pull-outs" },
  { value: "deliveries", label: "Deliveries" },
  { value: "pullouts", label: "Pull-outs" },
];

function emptyMessage(typeFilter: TypeFilter, includeSales: boolean) {
  const kinds = [];
  if (typeFilter !== "pullouts") kinds.push("deliveries");
  if (typeFilter !== "deliveries") kinds.push("pull-outs");
  if (includeSales) kinds.push("sales");
  return `No ${kinds.join(" or ")} logged yet`;
}

export default function MovementsPage() {
  const { typeFilter, setTypeFilter, includeSales, setIncludeSales } =
    useMovementsFilter();

  const showDeliveries = typeFilter !== "pullouts";
  const showPullouts = typeFilter !== "deliveries";

  const deliveries = useDeliveries(showDeliveries);
  const pullouts = usePullouts(showPullouts);
  const sales = useSales(includeSales);

  // Every included kind is already newest first, so a stable merge sort keeps
  // that order intact — reinterleaved only by createdAt across the kinds.
  const entries: Entry[] = useMemo(
    () =>
      [
        ...(showDeliveries
          ? deliveries.map((d) => ({ kind: "delivery" as const, ...d }))
          : []),
        ...(showPullouts
          ? pullouts.map((p) => ({ kind: "pullout" as const, ...p }))
          : []),
        ...(includeSales
          ? sales.map((s) => ({ kind: "sale" as const, ...s }))
          : []),
      ].sort((a, b) => b.createdAt - a.createdAt),
    [showDeliveries, deliveries, showPullouts, pullouts, includeSales, sales],
  );

  // What sheet is open, if any: logging a fresh entry, or reopening one that
  // was tapped in the list below — the same two components cover both, see
  // DeliverySheet's and PulloutSheet's own notes.
  const [activeSheet, setActiveSheet] = useState<
    | { mode: "create"; kind: "delivery" | "pullout" }
    | {
        mode: "edit";
        kind: "delivery" | "pullout" | "sale";
        entryId: Id<"deliveries"> | Id<"pullouts"> | Id<"sales">;
      }
    | null
  >(null);

  return (
    <main className="flex-1 p-3.5 space-y-3 pb-24">
      <div className="flex items-center justify-between">
        <h2 className="mt-1 mb-1 text-lg font-semibold">Movements</h2>
        <Link
          href="/movements/suppliers"
          className="text-accent text-sm font-semibold"
        >
          Suppliers
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setActiveSheet({ mode: "create", kind: "delivery" })}
          className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-ink"
        >
          + Delivery
        </button>
        <button
          type="button"
          onClick={() => setActiveSheet({ mode: "create", kind: "pullout" })}
          className="text-danger w-full rounded-xl border border-danger py-2.5 font-semibold"
        >
          − Pull-out
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setTypeFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              typeFilter === f.value
                ? "bg-accent text-accent-ink"
                : "card text-ink"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setIncludeSales(!includeSales)}
          aria-pressed={includeSales}
          className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${
            includeSales
              ? "border-accent bg-accent text-accent-ink"
              : "border-line text-ink"
          }`}
        >
          Include sales
        </button>
      </div>

      <WindowedDayList
        rows={entries}
        headerH={HEADER_H}
        rowH={ROW_H}
        viewportH={VIEWPORT_H}
        empty={emptyMessage(typeFilter, includeSales)}
        renderRow={(entry) => (
          <button
            type="button"
            onClick={() =>
              setActiveSheet({
                mode: "edit",
                kind: entry.kind,
                entryId: entry._id,
              })
            }
            className="flex h-full w-full items-center justify-between px-3 text-left"
          >
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">
                {entry.kind === "delivery" && "Delivery"}
                {entry.kind === "pullout" && "Pull-out"}
                {entry.kind === "sale" && "Sale"}
              </div>
              <div className="text-sub truncate text-[11px]">
                {formatTime(entry.createdAt)}
                {entry.kind === "pullout" && ` · ${entry.reasonCategory}`}
                {entry.kind === "sale" &&
                  ` · ${entry.paymentMethod}${
                    entry.customerName ? ` · ${entry.customerName}` : ""
                  }`}{" "}
                · {entry.lines.length} product
                {entry.lines.length === 1 ? "" : "s"} ·{" "}
                {entry.lines.map((l) => l.productName).join(", ")}
              </div>
            </div>
            <div
              className={`shrink-0 pl-3 text-right font-bold ${
                entry.kind === "delivery" ? "text-accent" : "text-danger"
              }`}
            >
              {signed(entry.netChange)}
            </div>
          </button>
        )}
      />

      {activeSheet?.mode === "create" && activeSheet.kind === "delivery" && (
        <DeliverySheet onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet?.mode === "create" && activeSheet.kind === "pullout" && (
        <PulloutSheet onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet?.mode === "edit" && activeSheet.kind === "delivery" && (
        <DeliverySheet
          onClose={() => setActiveSheet(null)}
          entryId={activeSheet.entryId as Id<"deliveries">}
        />
      )}
      {activeSheet?.mode === "edit" && activeSheet.kind === "pullout" && (
        <PulloutSheet
          onClose={() => setActiveSheet(null)}
          entryId={activeSheet.entryId as Id<"pullouts">}
        />
      )}
      {activeSheet?.mode === "edit" && activeSheet.kind === "sale" && (
        <SaleEntrySheet
          onClose={() => setActiveSheet(null)}
          entryId={activeSheet.entryId as Id<"sales">}
        />
      )}
    </main>
  );
}
