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
import { findOversold } from "../../../convex/oversold";
import { formatStock } from "../../../convex/remainderReading";
import { formatCount } from "../../../convex/unitLabels";

// `key` is the movement's own id when this line was prefilled from an entry
// under edit, so two lines touching the same product stay distinct rather
// than colliding on `productId`; a freshly added line gets a synthetic key
// instead, since adding an already-present product always appends a new line
// rather than merging into one — the same fix DeliverySheet needed once a
// product could carry the same line twice in two different Units.
//
// `quantity` is a count in the line's own `unitLabel`, not a Base amount —
// "5 trays" stays "5". Changing the Unit on a prefilled line clears its
// `movementId` (and `originalBaseAmount`) rather than patching it in place,
// same as DeliverySheet's `setLineUnit` — see that file's `Line` doc comment
// for why.
type Line = {
  key: string;
  movementId?: Id<"stockMovements">;
  productId: Id<"products">;
  unitLabel: string;
  quantity: number;
  originalBaseAmount?: number;
  deletedProductName?: string;
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
  const deletePullout = useMutation(api.stockMovements.deleteEntry);
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
  // seen — same rule the Register's `warned` follows. Reused as the
  // second-tap confirm when saving with every line removed, since that save
  // is a delete said differently — see `handleSave`.
  const [warned, setWarned] = useState(false);
  // The two-tap confirm for the standalone Delete button, independent of
  // `warned` and of any unsaved line edits — it deletes the entry as it
  // actually stands on the ledger.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Prefill runs once, the moment the entry loads — not on every re-render of
  // `existingEntry`, or her in-progress edits would be stomped every time the
  // query refreshes.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!isEditing || prefilled.current || existingEntry === undefined) {
      return;
    }
    prefilled.current = true;
    const activeIds = new Set(allProducts.map((p) => p._id));
    setLines(
      existingEntry.lines.map((l) => ({
        key: l.movementId,
        movementId: l.movementId,
        productId: l.productId,
        unitLabel: l.unitLabel,
        quantity: Math.abs(l.unitQuantity),
        originalBaseAmount: l.baseAmount,
        ...(activeIds.has(l.productId)
          ? {}
          : { deletedProductName: l.productName }),
      })),
    );
    if (existingEntry.reasonCategory) {
      setReasonCategory(existingEntry.reasonCategory as Reason);
    }
    setReasonNotes(existingEntry.reasonNotes ?? "");
  }, [isEditing, existingEntry, allProducts]);

  const matches = search.trim()
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : [];

  function addLine(productId: Id<"products">) {
    setWarned(false);
    const product = allProducts.find((p) => p._id === productId);
    const unitLabel = product?.defaultUnit.label ?? product?.baseUnitLabel;
    if (!unitLabel) return;
    // Always appends a new line rather than merging into an existing one for
    // the same product — a second line for it may need a different Unit.
    setLines((prev) => [
      ...prev,
      { key: `${productId}:${Date.now()}`, productId, unitLabel, quantity: 1 },
    ]);
    setSearch("");
  }

  function setLineUnit(key: string, unitLabel: string) {
    setWarned(false);
    setLines((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              unitLabel,
              // See the `Line` type's doc comment: the Unit and its
              // Base-equivalent snapshot are one unit of change server-side,
              // so this turns the line into a fresh insert rather than an
              // in-place patch `editEntry` would refuse.
              movementId: undefined,
              originalBaseAmount: undefined,
            }
          : l,
      ),
    );
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

  type ResolvedLine =
    | (Line & { product: (typeof allProducts)[number]; deleted: false })
    | (Line & { deleted: true });

  const resolvedLines = lines.flatMap<ResolvedLine>((line) => {
    if (line.deletedProductName) return [{ ...line, deleted: true }];
    const product = allProducts.find((p) => p._id === line.productId);
    return product ? [{ ...line, product, deleted: false }] : [];
  });

  function lineBaseAmount(
    product: (typeof allProducts)[number],
    unitLabel: string,
    quantity: number,
  ) {
    const unit =
      product.units.find((u) => u.label === unitLabel) ??
      product.units.find((u) => u.label === product.baseUnitLabel);
    return unit ? Math.round(quantity * unit.baseEquivalent) : quantity;
  }

  // Net delta per product this save would cause, relative to what's already
  // on the ledger — zero for every line while logging a fresh pull-out, since
  // every line there is new. Editing is what can turn a raised or added line
  // into a bigger loss of stock than the count already reflects, so this is
  // what the warning below is judged against, not the raw quantity typed.
  const deltaLines: { productId: Id<"products">; delta: number }[] = [];
  for (const line of resolvedLines) {
    if (line.deleted) continue;
    const baseAmount = lineBaseAmount(
      line.product,
      line.unitLabel,
      line.quantity,
    );
    deltaLines.push({
      productId: line.productId,
      delta: -baseAmount - (line.originalBaseAmount ?? 0),
    });
  }
  if (existingEntry) {
    const stillPresent = new Set(
      lines.flatMap((l) => (l.movementId ? [l.movementId] : [])),
    );
    for (const original of existingEntry.lines) {
      if (!stillPresent.has(original.movementId)) {
        // A dropped line reverses its own delta; it was already negative
        // (pullout), so reversing it adds stock back.
        deltaLines.push({
          productId: original.productId,
          delta: -original.baseAmount,
        });
      }
    }
  }

  const productCounts = allProducts.map((p) => ({
    productId: p._id,
    quantityOnHand: p.quantityOnHand,
  }));

  const oversold = findOversold(deltaLines, productCounts).flatMap(
    ({ productId, projected }) => {
      const product = allProducts.find((p) => p._id === productId);
      return product ? [{ productId, product, projected }] : [];
    },
  );

  // What deleting the entry outright — via the Delete button — would do to
  // each product, reckoned from the entry as it stands on the ledger rather
  // than from any unsaved edits in `lines`: deleting discards those edits
  // along with the entry, so it has to warn about the entry that will
  // actually be gone.
  const deleteOversold = findOversold(
    (existingEntry?.lines ?? []).map((l) => ({
      productId: l.productId,
      delta: -l.baseAmount,
    })),
    productCounts,
  ).flatMap(({ productId, projected }) => {
    const product = allProducts.find((p) => p._id === productId);
    return product ? [{ productId, product, projected }] : [];
  });

  const editableLines = resolvedLines.filter((l) => !l.deleted);
  const isDeleteViaEmptySave = isEditing && editableLines.length === 0;

  const noteRequired = reasonCategory === "other";
  const canSave =
    isDeleteViaEmptySave ||
    (resolvedLines.length > 0 &&
      reasonCategory !== null &&
      (!noteRequired || reasonNotes.trim().length > 0));

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSave() {
    if (!canSave) return;

    // Removing the last line and saving is deleting the entry said
    // differently, so it routes through the same `deleteEntry` mutation the
    // Delete button below calls — and gets the same two-tap confirm, folding
    // in the negative-stock warning rather than stacking a second dialog.
    if (isDeleteViaEmptySave && entryId) {
      if (!warned) {
        setWarned(true);
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await deletePullout({
          entry: { type: "pullout", entryId },
          allowNegative: true,
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setSaving(false);
      }
      return;
    }

    if (reasonCategory === null) return;

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
            unitLabel: l.unitLabel,
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
            unitLabel: l.unitLabel,
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

  async function handleDelete() {
    if (!entryId) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deletePullout({
        entry: { type: "pullout", entryId },
        allowNegative: true,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setDeleting(false);
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
                  {formatStock(p)} on hand
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
            if (l.deleted) {
              return (
                <div
                  key={l.key}
                  className="space-y-1 rounded-lg p-1.5 opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="pill shrink-0 bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
                        Deleted
                      </span>
                      <div className="min-w-0 truncate">
                        {l.deletedProductName}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="w-14 px-1.5 py-1 text-center font-semibold text-sub">
                        ×{formatCount(l.quantity, l.unitLabel)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            const isFocused =
              focusProductId !== undefined && l.productId === focusProductId;
            const isOther = focusProductId !== undefined && !isFocused;
            return (
              <div
                key={l.key}
                className={`space-y-1 rounded-lg p-1.5 ${
                  isFocused ? "bg-accent/10" : ""
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
                    {l.product.units.length > 1 && (
                      <select
                        value={l.unitLabel}
                        onChange={(e) => setLineUnit(l.key, e.target.value)}
                        aria-label={`Unit for ${l.product.name}`}
                        className="rounded-lg border border-line bg-card px-1.5 py-1 text-center font-semibold"
                      >
                        {l.product.units.map((u) => (
                          <option key={u.label} value={u.label}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    )}
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
                {!isEditing &&
                  lineBaseAmount(l.product, l.unitLabel, l.quantity) >
                    l.product.quantityOnHand && (
                    <div className="text-danger text-xs">
                      Only {formatStock(l.product)} on hand
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

        {/* Removing the last line and saving deletes the entry — this is
            that confirm, folding in how many products would go negative
            rather than stacking a second dialog on top of it. */}
        {warned && isDeleteViaEmptySave && (
          <div className="mt-3 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
            <p className="font-semibold text-danger">
              Removing the last line deletes this entry
            </p>
            {oversold.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[13px]">
                {oversold.map(({ productId, product, projected }) => (
                  <li key={productId}>
                    <span className="font-semibold">{product.name}</span> —
                    currently {formatStock(product)}, deleting leaves{" "}
                    {formatStock({ ...product, quantityOnHand: projected })}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-sub text-[13px]">
              Save again to confirm the delete.
            </p>
          </div>
        )}

        {/* Only when the client's own counts show the overdraw — on the
            server-refusal path `oversold` is empty and the error above is
            the warning. */}
        {warned && oversold.length > 0 && !isDeleteViaEmptySave && (
          <div className="mt-3 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
            <p className="font-semibold text-danger">
              This will take stock below zero
            </p>
            <ul className="mt-1 space-y-0.5 text-[13px]">
              {oversold.map(({ productId, product, projected }) => (
                <li key={productId}>
                  <span className="font-semibold">{product.name}</span> —
                  currently {formatStock(product)}, this{" "}
                  {isEditing ? "edit" : "pull-out"} leaves{" "}
                  {formatStock({ ...product, quantityOnHand: projected })}
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
              ? isDeleteViaEmptySave
                ? "Delete entry"
                : "Record anyway"
              : isEditing
                ? "Save Changes"
                : "Save Pull-out"}
        </button>

        {isEditing && (
          <>
            <div className="mt-2 flex gap-2">
              {confirmingDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="card flex-1 py-2.5 font-semibold"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className={`flex-1 rounded-xl border py-2.5 font-semibold ${
                  confirmingDelete
                    ? "bg-danger border-danger text-white"
                    : "text-danger border-line"
                }`}
              >
                {deleting
                  ? "Deleting..."
                  : confirmingDelete
                    ? "Confirm Delete"
                    : "Delete Entry"}
              </button>
            </div>
            {confirmingDelete && deleteOversold.length > 0 && (
              <div className="mt-2 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
                <p className="font-semibold text-danger">
                  This will take stock below zero
                </p>
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  {deleteOversold.map(({ productId, product, projected }) => (
                    <li key={productId}>
                      <span className="font-semibold">{product.name}</span> —
                      currently {formatStock(product)}, deleting this entry
                      leaves{" "}
                      {formatStock({ ...product, quantityOnHand: projected })}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
