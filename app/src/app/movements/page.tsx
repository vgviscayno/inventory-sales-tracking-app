"use client";

import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { DeliverySheet } from "./DeliverySheet";
import { formatTime, signed } from "./format";
import { WindowedDayList } from "./WindowedDayList";

const HEADER_H = 30;
const ROW_H = 54;
const VIEWPORT_H = 520;

export default function MovementsPage() {
  const entries = useQuery(api.deliveries.list, {}) ?? [];
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main className="flex-1 p-3.5 space-y-3 pb-24">
      <h2 className="mt-1 mb-1 text-lg font-semibold">Movements</h2>

      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-ink"
      >
        + Delivery
      </button>

      <WindowedDayList
        rows={entries}
        headerH={HEADER_H}
        rowH={ROW_H}
        viewportH={VIEWPORT_H}
        renderRow={(entry) => (
          <div className="flex h-full w-full items-center justify-between px-3">
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">Delivery</div>
              <div className="text-sub truncate text-[11px]">
                {formatTime(entry.createdAt)} · {entry.lines.length} product
                {entry.lines.length === 1 ? "" : "s"} ·{" "}
                {entry.lines.map((l) => l.productName).join(", ")}
              </div>
            </div>
            <div className="text-accent shrink-0 pl-3 text-right font-bold">
              {signed(entry.netChange)}
            </div>
          </div>
        )}
      />

      {sheetOpen && <DeliverySheet onClose={() => setSheetOpen(false)} />}
    </main>
  );
}
