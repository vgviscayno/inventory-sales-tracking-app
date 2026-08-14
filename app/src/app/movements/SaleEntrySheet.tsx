"use client";

// A sale reopened from the Movements tab or a product's ledger — read-only,
// because a sale's stock and money both flow through the Register's checkout
// (src/app/page.tsx), and editing it here would let the two drift. This sheet
// exists so tapping a sale entry lands somewhere instead of nowhere, and
// tells her where the real edit lives.

import { useQuery } from "convex/react";
import { useEffect } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { signed } from "../format";

export function SaleEntrySheet({
  onClose,
  entryId,
  focusProductId,
}: {
  onClose: () => void;
  entryId: Id<"sales">;
  focusProductId?: Id<"products">;
}) {
  const entry = useQuery(api.stockMovements.getEntry, {
    entry: { type: "sale", entryId },
  });

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only dismiss; Escape handled above
    // biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only dismiss; Escape handled above
    <div className="fixed inset-0 z-20 bg-black/35" onClick={onClose}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops click propagation, not a user affordance */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: only stops click propagation, not a user affordance */}
      <div
        className="card fixed inset-x-0 bottom-0 z-[21] mx-auto max-h-[80vh] max-w-[480px] overflow-y-auto rounded-t-2xl rounded-b-none px-3.5 pt-4 pb-[76px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        <h3 className="mb-2.5 font-semibold">Sale</h3>

        <div className="rounded-xl border border-line bg-card p-3 text-[13px]">
          This sale is edited from the Register, not here — checkout is where
          its stock and money both change together.
        </div>

        <div className="mt-3 space-y-2">
          {entry === undefined && (
            <p className="text-sub py-4 text-center text-[13px]">Loading…</p>
          )}
          {entry?.lines.map((l) => {
            const isFocused =
              focusProductId !== undefined && l.productId === focusProductId;
            const isOther = focusProductId !== undefined && !isFocused;
            return (
              <div
                key={l.movementId}
                className={`flex items-center justify-between gap-2 rounded-lg p-1.5 ${
                  isFocused ? "bg-accent/10" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  <div className="min-w-0 truncate">{l.productName}</div>
                  {isOther && (
                    <span className="text-sub shrink-0 text-[11px]">
                      also in this entry
                    </span>
                  )}
                </div>
                <div className="text-danger shrink-0 font-bold">
                  {signed(l.unitQuantity)} {l.unitLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
