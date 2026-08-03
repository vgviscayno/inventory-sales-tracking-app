"use client";

// PROTOTYPE ONLY — throwaway. The grouped-entry sheet, reached from the
// Movements tab. Same shape as the one on the product page, minus the
// "focused product" highlight — in a global list nothing is focused.

import { useState } from "react";
import {
  deltaColor,
  type Entry,
  entryLabel,
  formatDateTime,
  type Movement,
  REASON_LABELS,
  signed,
} from "../../../prototype/ledger";

export function EntrySheet({
  entry,
  onClose,
}: {
  entry: Entry;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<Movement[]>(entry.lines);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const readOnly = entry.type === "sale";

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
          <h3 className="font-semibold">{entryLabel(entry)}</h3>
          <button type="button" onClick={onClose} className="text-sub text-xl">
            ×
          </button>
        </div>
        <div className="text-sub mb-3 text-[12px]">
          logged {formatDateTime(entry.createdAt)}
          {readOnly && " · sales are edited from the Register"}
        </div>

        <div className="space-y-2">
          {lines.map((l) => (
            <div key={l._id} className="card p-2.5">
              <div className="flex items-center justify-between">
                <div className="text-[14px] font-semibold">{l.productName}</div>
                {readOnly ? (
                  <span
                    className="font-semibold"
                    style={{ color: deltaColor(l.quantity) }}
                  >
                    {signed(l.quantity)}
                  </span>
                ) : (
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
                )}
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

        {!readOnly && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
