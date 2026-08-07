"use client";

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { DeliverySheet } from "./DeliverySheet";
import { formatTime, signed } from "./format";
import { PulloutSheet } from "./PulloutSheet";
import { WindowedDayList } from "./WindowedDayList";

const HEADER_H = 30;
const ROW_H = 54;
const VIEWPORT_H = 520;

type Entry =
  | ({ kind: "delivery" } & ReturnType<typeof useDeliveries>[number])
  | ({ kind: "pullout" } & ReturnType<typeof usePullouts>[number]);

function useDeliveries() {
  return useQuery(api.deliveries.list, {}) ?? [];
}

function usePullouts() {
  return useQuery(api.pullouts.list, {}) ?? [];
}

export default function MovementsPage() {
  const deliveries = useDeliveries();
  const pullouts = usePullouts();
  // Both entry kinds newest first individually, so a stable merge sort keeps
  // that order intact — reinterleaved only by createdAt across the two.
  const entries: Entry[] = useMemo(
    () =>
      [
        ...deliveries.map((d) => ({ kind: "delivery" as const, ...d })),
        ...pullouts.map((p) => ({ kind: "pullout" as const, ...p })),
      ].sort((a, b) => b.createdAt - a.createdAt),
    [deliveries, pullouts],
  );

  const [deliverySheetOpen, setDeliverySheetOpen] = useState(false);
  const [pulloutSheetOpen, setPulloutSheetOpen] = useState(false);

  return (
    <main className="flex-1 p-3.5 space-y-3 pb-24">
      <h2 className="mt-1 mb-1 text-lg font-semibold">Movements</h2>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDeliverySheetOpen(true)}
          className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-ink"
        >
          + Delivery
        </button>
        <button
          type="button"
          onClick={() => setPulloutSheetOpen(true)}
          className="text-danger w-full rounded-xl border border-danger py-2.5 font-semibold"
        >
          − Pull-out
        </button>
      </div>

      <WindowedDayList
        rows={entries}
        headerH={HEADER_H}
        rowH={ROW_H}
        viewportH={VIEWPORT_H}
        renderRow={(entry) => (
          <div className="flex h-full w-full items-center justify-between px-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">
                {entry.kind === "delivery" ? "Delivery" : "Pull-out"}
              </div>
              <div className="text-sub truncate text-[11px]">
                {formatTime(entry.createdAt)}
                {entry.kind === "pullout" && ` · ${entry.reasonCategory}`} ·{" "}
                {entry.lines.length} product
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
          </div>
        )}
      />

      {deliverySheetOpen && (
        <DeliverySheet onClose={() => setDeliverySheetOpen(false)} />
      )}
      {pulloutSheetOpen && (
        <PulloutSheet onClose={() => setPulloutSheetOpen(false)} />
      )}
    </main>
  );
}
