"use client";

// The `− Pull-out` bottom sheet — built on the same bones as DeliverySheet
// (search, tap to add, steppers, remove), plus the reason a delivery never
// needs and the negative-stock warning the Register already carries (see
// completeSale in src/app/page.tsx): warn once, one confirm, never block.
//
// The same component reopens an existing pull-out for correction: passing
// `entryId` prefills its reason and lines from `getEntry` instead of starting
// empty, and save routes through `editEntry`'s diff instead of `create`.

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// `key` is the movement's own id when this line was prefilled from an entry
// under edit, so two lines touching the same product stay distinct rather
// than colliding on `productId`; a freshly added line falls back to
// `productId`, which is fine because adding an already-present product
// merges into its existing line rather than creating a second one.
type Line = {
  key: string;
  movementId?: Id<"stockMovements">;
  productId: Id<"products">;
  quantity: number;
  /** The quantity this line carried when the sheet opened — undefined for a
   * line added during this edit. */
  originalQuantity?: number;
};

const REASONS = [
  { value: "damaged", label: "Damaged" },
  { value: "expired", label: "Expired" },
  { value: "personal use", label: "Personal use" },
  { value: "given away", label: "Given away" },
  { value: "other", label: "Other" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

export function PulloutSheet({
  onClose,
  entryId,
  focusProductId,
}: {
  onClose: () => void;
  entryId?: Id<"pullouts">;
  focusProductId?: Id<"products">;
}) {
  const isEditing = entryId !== undefined;
  const allProducts = useQuery(api.products.list, {}) ?? [];
  const createPullout = useMutation(api.pullouts.create);
  const editPullout = useMutation(api.stockMovements.editEntry);
  const existingEntry = useQuery(
    api.stockMovements.getEntry,
    entryId ? { entry: { type: "pullout", entryId } } : "skip",
  );

  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [reasonCategory, setReasonCategory] = useState<Reason | null>(null);
  const [reasonNotes, setReasonNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether she has been shown the below-zero warning yet, cleared whenever
  // the lines change so consent never carries over to a pull-out she has not
  // seen — same rule the Register's `warned` follows.
  const [warned, setWarned] = useState(false);

  // Prefill runs once, the moment the entry loads — not on every re-render of
  // `existingEntry`, or her in-progress edits would be stomped every time the
  // query refreshes.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!isEditing || prefilled.current || existingEntry === undefined) {
      return;
    }
    prefilled.current = true;
    setLines(
      existingEntry.lines.map((l) => ({
        key: l.movementId,
        movementId: l.movementId,
        productId: l.productId,
        quantity: Math.abs(l.quantity),
        originalQuantity: Math.abs(l.quantity),
      })),
    );
    if (existingEntry.reasonCategory) {
      setReasonCategory(existingEntry.reasonCategory as Reason);
    }
    setReasonNotes(existingEntry.reasonNotes ?? "");
  }, [isEditing, existingEntry]);

  const matches = search.trim()
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : [];

  function addLine(productId: Id<"products">) {
    setWarned(false);
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { key: productId, productId, quantity: 1 }];
    });
    setSearch("");
  }

  function bump(key: string, by: number) {
    setWarned(false);
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, quantity: Math.max(1, l.quantity + by) } : l,
      ),
    );
  }

  function setQuantity(key: string, quantity: number) {
    setWarned(false);
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, quantity } : l)),
    );
  }

  function removeLine(key: string) {
    setWarned(false);
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  // Each line joined to the product as it stands right now, dropping any line
  // whose product got deleted mid-edit.
  const resolvedLines = lines.flatMap((line) => {
    const product = allProducts.find((p) => p._id === line.productId);
    return product ? [{ ...line, product }] : [];
  });

  // Net delta per product this save would cause, relative to what's already
  // on the ledger — zero for every line while logging a fresh pull-out, since
  // every line there is new. Editing is what can turn a raised or added line
  // into a bigger loss of stock than the count already reflects, so this is
  // what the warning below is judged against, not the raw quantity typed.
  const netDeltaByProduct = new Map<Id<"products">, number>();
  const bumpNetDelta = (productId: Id<"products">, delta: number) =>
    netDeltaByProduct.set(
      productId,
      (netDeltaByProduct.get(productId) ?? 0) + delta,
    );

  for (const line of resolvedLines) {
    bumpNetDelta(
      line.productId,
      -(line.quantity - (line.originalQuantity ?? 0)),
    );
  }
  if (existingEntry) {
    const stillPresent = new Set(
      lines.flatMap((l) => (l.movementId ? [l.movementId] : [])),
    );
    for (const original of existingEntry.lines) {
      if (!stillPresent.has(original.movementId)) {
        // A dropped line reverses its own delta; it was already negative
        // (pullout), so reversing it adds stock back.
        bumpNetDelta(original.productId, -original.quantity);
      }
    }
  }

  const oversold = [...netDeltaByProduct.entries()].flatMap(
    ([productId, delta]) => {
      const product = allProducts.find((p) => p._id === productId);
      if (!product) return [];
      const projected = product.quantityOnHand + delta;
      return projected < 0 ? [{ productId, product, projected }] : [];
    },
  );

  const noteRequired = reasonCategory === "other";
  const canSave =
    resolvedLines.length > 0 &&
    reasonCategory !== null &&
    (!noteRequired || reasonNotes.trim().length > 0);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSave() {
    if (!canSave || reasonCategory === null) return;

    if (oversold.length > 0 && !warned) {
      setWarned(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isEditing && entryId) {
        await editPullout({
          entry: { type: "pullout", entryId },
          lines: resolvedLines.map((l) => ({
            movementId: l.movementId,
            productId: l.productId,
            quantity: l.quantity,
          })),
          reasonCategory,
          reasonNotes: reasonNotes.trim() || undefined,
          allowNegative: warned,
        });
      } else {
        await createPullout({
          lines: resolvedLines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
          })),
          reasonCategory,
          reasonNotes: reasonNotes.trim() || undefined,
          allowNegative: warned,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      // The server refused, so it is telling her something the client's
      // counts did not — arm the confirm rather than leaving her stuck.
      setWarned(true);
    } finally {
      setSaving(false);
    }
  }

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
        <h3 className="mb-2.5 font-semibold">
          {isEditing ? "Edit pull-out" : "Log a pull-out"}
        </h3>

        <div className="grid grid-cols-3 gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => {
                setWarned(false);
                setReasonCategory(r.value);
              }}
              className={`rounded-lg py-2 text-[13px] font-semibold ${
                reasonCategory === r.value
                  ? "bg-accent text-accent-ink"
                  : "card"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          value={reasonNotes}
          onChange={(e) => setReasonNotes(e.target.value)}
          placeholder={
            noteRequired
              ? "What happened? (required for “other”)"
              : "Note (optional)"
          }
          rows={2}
          className="mt-2 w-full resize-none rounded-[10px] border border-line bg-card px-3 py-2.5 text-[15px]"
        />

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products to add…"
          className="mt-2.5 w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-[15px]"
        />

        {search.trim() && (
          <div className="card mt-1.5 max-h-40 divide-y divide-line overflow-y-auto">
            {matches.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => addLine(p._id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <span>{p.name}</span>
                <span className="text-sub text-[13px]">
                  {p.quantityOnHand} on hand
                </span>
              </button>
            ))}
            {matches.length === 0 && (
              <p className="text-sub px-3 py-2 text-[13px]">
                No products match
              </p>
            )}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {resolvedLines.map((l) => {
            const isFocused =
              focusProductId !== undefined && l.productId === focusProductId;
            const isOther = focusProductId !== undefined && !isFocused;
            return (
              <div
                key={l.key}
                className={`space-y-1 ${
                  isFocused ? "rounded-lg bg-accent/10 p-1.5 -m-1.5" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <div className="min-w-0 truncate">{l.product.name}</div>
                    {isOther && (
                      <span className="text-sub shrink-0 text-[11px]">
                        also in this entry
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => bump(l.key, -1)}
                      className="h-[30px] w-[30px] rounded-lg border border-line bg-card"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={l.quantity}
                      onChange={(e) =>
                        setQuantity(l.key, Math.max(1, Number(e.target.value)))
                      }
                      className="w-14 rounded-lg border border-line bg-card px-1.5 py-1 text-center font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => bump(l.key, 1)}
                      className="h-[30px] w-[30px] rounded-lg border border-line bg-card"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="text-danger px-1 text-lg leading-none"
                      aria-label={`Remove ${l.product.name}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {/* This per-line hint compares against the live count, which
                    already has this line's *original* quantity baked in
                    while editing — the entry-wide warning below is what
                    judges the net effect correctly, so this stays
                    create-only. */}
                {!isEditing && l.quantity > l.product.quantityOnHand && (
                  <div className="text-danger text-xs">
                    Only {l.product.quantityOnHand} on hand
                  </div>
                )}
              </div>
            );
          })}
          {resolvedLines.length === 0 && (
            <p className="text-sub py-4 text-center text-[13px]">
              Search above and tap a product to add it to this pull-out
            </p>
          )}
        </div>

        {error && <p className="text-danger mt-2 text-sm">{error}</p>}

        {/* Only when the client's own counts show the overdraw — on the
            server-refusal path `oversold` is empty and the error above is
            the warning. */}
        {warned && oversold.length > 0 && (
          <div className="mt-3 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
            <p className="font-semibold text-danger">
              This will take stock below zero
            </p>
            <ul className="mt-1 space-y-0.5 text-[13px]">
              {oversold.map(({ productId, product, projected }) => (
                <li key={productId}>
                  <span className="font-semibold">{product.name}</span> —
                  currently {product.quantityOnHand}, this{" "}
                  {isEditing ? "edit" : "pull-out"} leaves {projected}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-sub text-[13px]">
              Record the {isEditing ? "edit" : "pull-out"} anyway — the count is
              what needs fixing, not the {isEditing ? "edit" : "pull-out"}.
              Recount these after.
            </p>
          </div>
        )}

        <button
          type="button"
          disabled={!canSave || saving}
          onClick={handleSave}
          className={`mt-3.5 w-full rounded-xl py-3.5 font-bold text-accent-ink disabled:bg-[#d6d3d1] ${
            warned ? "bg-danger" : "bg-accent"
          }`}
        >
          {saving
            ? "Saving..."
            : warned
              ? "Record anyway"
              : isEditing
                ? "Save Changes"
                : "Save Pull-out"}
        </button>
      </div>
    </div>
  );
}
