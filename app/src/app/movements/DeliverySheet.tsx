"use client";

// The `+ Delivery` bottom sheet. It deliberately follows the sale sheet of the
// Register (src/app/page.tsx), so the muscle memory transfers.
// Search a product by name. Tap a result to add a Line. Adjust with the
// steppers or a typed quantity. Drop a mis-tapped Line, and save.
//
// The same component reopens an existing Delivery for a correction. An
// `entryId` prefills the Lines from `getEntry` instead of an empty sheet. The
// save then routes through the diff in `editEntry`, and not `create`.
// Inline "+ Add as new product" only makes sense while somebody logs a fresh
// shipment. The sheet hides it during an edit, because a forgotten Line there
// names a product the catalog already holds.

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { findNegativeProjections } from "../../../convex/negativeProjections";
import { formatStock } from "../../../convex/remainderReading";
import { formatCount } from "../../../convex/unitLabels";
import { SupplierPicker } from "../SupplierPicker";

// A Line either names a product that already exists, or collects the name and
// price to create one with. The second kind appears once somebody chooses
// "+ Add as new product".
// `key` gives both kinds a stable identity, for React and for the `bump`,
// `setQuantity`, and `removeLine` calls below. Those calls do not care which
// kind they touch.
// A Line prefilled from an Entry under edit carries `movementId` and the
// `originalBaseAmount` it opened with. The diff that reaches `editEntry` is
// therefore judged against what this Line was. It is not judged against the
// product's live count, which other Entries may have moved.
// A Line's `key` is its `movementId` where it has one. Two prefilled Lines for
// one product therefore stay distinct, and do not collide on `productId`. One
// Entry can touch one product twice.
//
// A prefilled Line's `quantity` is a count in its own `unitLabel` and not a
// Base amount. "5 trays" stays "5" and does not become "150".
// A Unit change on a prefilled Line clears its `movementId` and its
// `originalBaseAmount`. It does not patch the Line in place. `editEntry`
// refuses an in-place Unit change on a surviving row. That row snapshots the
// Unit and its Base equivalent together.
// The sheet therefore turns that Line into a fresh insert. The old row falls
// out of the diff as a drop. The strictness lives on the server. From here it
// looks like a choice of a different Unit.
type Line =
  | {
      kind: "existing";
      key: string;
      movementId?: Id<"stockMovements">;
      productId: Id<"products">;
      unitLabel: string;
      quantity: number;
      originalBaseAmount?: number;
    }
  | {
      kind: "deleted";
      key: string;
      movementId: Id<"stockMovements">;
      productId: Id<"products">;
      productName: string;
      unitLabel: string;
      quantity: number;
      originalBaseAmount: number;
    }
  | {
      kind: "new";
      key: string;
      name: string;
      unitLabel: string;
      price: string;
      quantity: number;
    };

export function DeliverySheet({
  onClose,
  entryId,
  focusProductId,
}: {
  onClose: () => void;
  entryId?: Id<"deliveries">;
  focusProductId?: Id<"products">;
}) {
  const isEditing = entryId !== undefined;
  const allProducts = useQuery(api.products.list, {}) ?? [];
  const createDelivery = useMutation(api.deliveries.create);
  const editDelivery = useMutation(api.stockMovements.editEntry);
  const deleteDelivery = useMutation(api.stockMovements.deleteEntry);
  const existingEntry = useQuery(
    api.stockMovements.getEntry,
    entryId ? { entry: { type: "delivery", entryId } } : "skip",
  );

  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState<Id<"suppliers"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Whether the sheet has shown the Negative projection warning yet. It clears
  // whenever the Lines change, so consent never carries over to an edit nobody
  // has seen. `warned` in the Register follows the same rule.
  // The flag doubles as the second-tap confirm for a save with every Line
  // removed. That save is a delete said differently. See `handleSave`.
  const [warned, setWarned] = useState(false);
  // The two-tap confirm for the standalone Delete button. It is independent of
  // `warned` and of any unsaved Line edit. The delete takes the Entry as it
  // stands on the Ledger.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // The prefill runs once, at the moment the Entry loads. It must not run on
  // every re-render of `existingEntry`. A refresh of the query would otherwise
  // discard an edit in progress. A rename of a product this sheet does not
  // touch is one such refresh.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!isEditing || prefilled.current || existingEntry === undefined) {
      return;
    }

    prefilled.current = true;
    setSupplierId(existingEntry.supplierId ?? null);
    const activeIds = new Set(allProducts.map((p) => p._id));
    setLines(
      existingEntry.lines.map((l) =>
        activeIds.has(l.productId)
          ? {
              kind: "existing" as const,
              key: l.movementId,
              movementId: l.movementId,
              productId: l.productId,
              unitLabel: l.unitLabel,
              quantity: l.unitQuantity,
              originalBaseAmount: l.baseAmount,
            }
          : {
              kind: "deleted" as const,
              key: l.movementId,
              movementId: l.movementId,
              productId: l.productId,
              productName: l.productName,
              unitLabel: l.unitLabel,
              quantity: l.unitQuantity,
              originalBaseAmount: l.baseAmount,
            },
      ),
    );
  }, [isEditing, existingEntry, allProducts]);

  const trimmedSearch = search.trim();
  const matches = trimmedSearch
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
      )
    : [];

  function addExistingLine(productId: Id<"products">) {
    setWarned(false);
    const product = allProducts.find((p) => p._id === productId);
    const unitLabel = product?.defaultUnit.label ?? product?.baseUnitLabel;
    if (!unitLabel) return;
    setLines((prev) => [
      ...prev,
      {
        kind: "existing",
        key: `${productId}:${Date.now()}`,
        productId,
        unitLabel,
        quantity: 1,
      },
    ]);
    setSearch("");
  }

  function setLineUnit(key: string, unitLabel: string) {
    setWarned(false);
    setLines((prev) =>
      prev.map((l) =>
        l.key === key && l.kind === "existing"
          ? {
              ...l,
              unitLabel,
              // The server changes the Unit and its Base equivalent snapshot
              // together. To drop the movement id turns this Line into a fresh
              // insert, and not the in-place patch `editEntry` refuses. See the
              // doc comment on the `Line` type.
              movementId: undefined,
              originalBaseAmount: undefined,
            }
          : l,
      ),
    );
  }

  function addNewProductLine(name: string) {
    setLines((prev) => [
      ...prev,
      {
        kind: "new",
        key: `new:${Date.now()}`,
        name,
        unitLabel: "",
        price: "",
        quantity: 1,
      },
    ]);
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

  function setNewProductUnitLabel(key: string, unitLabel: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key && l.kind === "new" ? { ...l, unitLabel } : l,
      ),
    );
  }

  function setNewProductPrice(key: string, price: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key && l.kind === "new" ? { ...l, price } : l,
      ),
    );
  }

  function removeLine(key: string) {
    setWarned(false);
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  type ResolvedLine =
    | (Extract<Line, { kind: "existing" }> & {
        product: (typeof allProducts)[number];
      })
    | Extract<Line, { kind: "deleted" }>
    | Extract<Line, { kind: "new" }>;

  const resolvedLines = lines.flatMap<ResolvedLine>((line) => {
    if (line.kind === "new" || line.kind === "deleted") return [line];
    const product = allProducts.find((p) => p._id === line.productId);
    return product ? [{ ...line, product }] : [];
  });

  // The net delta per product this save causes, against what the Ledger already
  // holds. Every Line of a fresh Delivery is new, so the delta there is the
  // whole Line.
  // An edit is what turns a lowered or dropped Line into a loss of stock. The
  // warning below judges these deltas, and not the raw typed Unit quantity.
  const deltaLines: { productId: Id<"products">; delta: number }[] = [];
  for (const line of resolvedLines) {
    if (line.kind !== "existing") continue;
    const unit =
      line.product.units.find((u) => u.label === line.unitLabel) ??
      line.product.units.find((u) => u.label === line.product.baseUnitLabel);
    if (!unit) continue;
    const baseAmount = Math.round(line.quantity * unit.baseEquivalent);
    deltaLines.push({
      productId: line.productId,
      delta: baseAmount - (line.originalBaseAmount ?? 0),
    });
  }
  if (existingEntry) {
    const stillPresent = new Set(
      lines.flatMap((l) =>
        l.kind === "existing" && l.movementId ? [l.movementId] : [],
      ),
    );
    for (const original of existingEntry.lines) {
      if (!stillPresent.has(original.movementId)) {
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

  const negativeProjections = findNegativeProjections(
    deltaLines,
    productCounts,
  ).flatMap(({ productId, projected }) => {
    const product = allProducts.find((p) => p._id === productId);
    return product ? [{ productId, product, projected }] : [];
  });

  // What a delete of the whole Entry, through the Delete button, does to each
  // product. The reckoning comes from the Entry as it stands on the Ledger, and
  // not from an unsaved edit in `lines`. A delete discards those edits with the
  // Entry, so the warning must describe the Entry that actually goes.
  const deleteNegativeProjections = findNegativeProjections(
    (existingEntry?.lines ?? []).map((l) => ({
      productId: l.productId,
      delta: -l.baseAmount,
    })),
    productCounts,
  ).flatMap(({ productId, projected }) => {
    const product = allProducts.find((p) => p._id === productId);
    return product ? [{ productId, product, projected }] : [];
  });

  const editableLines = resolvedLines.filter((l) => l.kind !== "deleted");
  const isDeleteViaEmptySave = isEditing && editableLines.length === 0;

  const canSave =
    isDeleteViaEmptySave ||
    (resolvedLines.length > 0 &&
      resolvedLines.every(
        (l) =>
          l.kind === "existing" ||
          l.kind === "deleted" ||
          (l.unitLabel.trim().length > 0 && Number(l.price) > 0),
      ));

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSave() {
    if (!canSave) return;

    // To remove the last Line and save is a delete said differently. It routes
    // through the same `deleteEntry` mutation the Delete button below calls,
    // and takes the same two-tap confirm. The confirm folds in the Negative
    // projection warning instead of stacking a second dialog.
    if (isDeleteViaEmptySave && entryId) {
      if (!warned) {
        setWarned(true);
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await deleteDelivery({
          entry: { type: "delivery", entryId },
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

    if (negativeProjections.length > 0 && !warned) {
      setWarned(true);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isEditing && entryId) {
        await editDelivery({
          entry: { type: "delivery", entryId },
          lines: resolvedLines
            .filter(
              (
                l,
              ): l is
                | Extract<ResolvedLine, { kind: "existing" }>
                | Extract<ResolvedLine, { kind: "deleted" }> =>
                l.kind === "existing" || l.kind === "deleted",
            )
            .map((l) => ({
              movementId: l.movementId,
              productId: l.productId,
              unitLabel: l.unitLabel,
              quantity: l.quantity,
            })),
          supplierId,
          allowNegative: warned,
        });
      } else {
        await createDelivery({
          lines: resolvedLines
            .filter((l) => l.kind !== "deleted")
            .map((l) =>
              l.kind === "existing"
                ? {
                    kind: "existing",
                    productId: l.productId,
                    unitLabel: l.unitLabel,
                    quantity: l.quantity,
                  }
                : {
                    kind: "new",
                    name: l.name,
                    unitLabel: l.unitLabel.trim(),
                    price: Number(l.price),
                    quantity: l.quantity,
                  },
            ),
          supplierId: supplierId ?? undefined,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      // The server refused, so it knows something the client's counts did not.
      // Arm the confirm instead of leaving the save stuck.
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
      await deleteDelivery({
        entry: { type: "delivery", entryId },
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
        className="card fixed inset-x-0 bottom-0 z-21 mx-auto max-h-[80vh] max-w-120 overflow-y-auto rounded-t-2xl rounded-b-none px-3.5 pt-4 pb-19"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
        <h3 className="mb-2.5 font-semibold">
          {isEditing ? "Edit delivery" : "Log a delivery"}
        </h3>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products to add…"
          className="w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-[15px]"
        />

        {trimmedSearch && (
          <div className="card mt-1.5 max-h-40 divide-y divide-line overflow-y-auto">
            {matches.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => addExistingLine(p._id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left"
              >
                <span>{p.name}</span>
                <span className="text-sub text-[13px]">
                  {formatStock(p)} on hand
                </span>
              </button>
            ))}
            {matches.length === 0 && !isEditing && (
              <button
                type="button"
                onClick={() => addNewProductLine(trimmedSearch)}
                className="text-accent flex w-full items-center px-3 py-2 text-left font-semibold"
              >
                + Add "{trimmedSearch}" as new product
              </button>
            )}
            {matches.length === 0 && isEditing && (
              <p className="text-sub px-3 py-2 text-[13px]">
                No products match
              </p>
            )}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {resolvedLines.map((l) => {
            const isFocused =
              focusProductId !== undefined &&
              l.kind === "existing" &&
              l.productId === focusProductId;
            const isOther =
              focusProductId !== undefined &&
              l.kind === "existing" &&
              !isFocused;

            if (l.kind === "deleted") {
              return (
                <div
                  key={l.key}
                  className="flex items-center justify-between gap-2 rounded-lg p-1.5 opacity-60"
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="pill shrink-0 bg-neutral-200 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
                      Deleted
                    </span>
                    <div className="min-w-0 truncate">{l.productName}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="w-14 px-1.5 py-1 text-center font-semibold text-sub">
                      ×{formatCount(l.quantity, l.unitLabel)}
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={l.key}
                className={`flex items-center justify-between gap-2 rounded-lg p-1.5 ${
                  isFocused ? "bg-accent/10" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-1.5">
                  {l.kind === "new" && (
                    <span className="pill new shrink-0">New</span>
                  )}
                  <div className="min-w-0 truncate">
                    {l.kind === "existing" ? l.product.name : l.name}
                  </div>
                  {isOther && (
                    <span className="text-sub shrink-0 text-[11px]">
                      also in this entry
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {l.kind === "new" && (
                    <>
                      <input
                        type="text"
                        value={l.unitLabel}
                        onChange={(e) =>
                          setNewProductUnitLabel(l.key, e.target.value)
                        }
                        placeholder="Base unit"
                        aria-label={`Base unit for ${l.name}`}
                        className="w-20 rounded-lg border border-line bg-card px-1.5 py-1 text-center font-semibold"
                      />
                      <input
                        type="number"
                        inputMode="decimal"
                        value={l.price}
                        onChange={(e) =>
                          setNewProductPrice(l.key, e.target.value)
                        }
                        placeholder="Price"
                        aria-label={`Price for ${l.name}`}
                        className="w-16 rounded-lg border border-line bg-card px-1.5 py-1 text-center font-semibold"
                      />
                    </>
                  )}
                  {l.kind === "existing" && l.product.units.length > 1 && (
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
                    className="h-7.5 w-7.5 rounded-lg border border-line bg-card"
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
                    className="h-7.5 w-7.5 rounded-lg border border-line bg-card"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLine(l.key)}
                    className="text-danger px-1 text-lg leading-none"
                    aria-label={`Remove ${l.kind === "existing" ? l.product.name : l.name}`}
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
          {resolvedLines.length === 0 && (
            <p className="text-sub py-4 text-center text-[13px]">
              Search above and tap a product to add it to this delivery
            </p>
          )}
        </div>

        <div className="mt-3">
          <SupplierPicker value={supplierId} onChange={setSupplierId} />
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
            {negativeProjections.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[13px]">
                {negativeProjections.map(
                  ({ productId, product, projected }) => (
                    <li key={productId}>
                      <span className="font-semibold">{product.name}</span> —
                      currently {formatStock(product)}, deleting leaves{" "}
                      {formatStock({ ...product, quantityOnHand: projected })}
                    </li>
                  ),
                )}
              </ul>
            )}
            <p className="mt-1.5 text-sub text-[13px]">
              Save again to confirm the delete.
            </p>
          </div>
        )}

        {/* Only when the client's own counts show the overdraw — on the
            server-refusal path `negativeProjections` is empty and the error above is
            the warning. */}
        {warned && negativeProjections.length > 0 && !isDeleteViaEmptySave && (
          <div className="mt-3 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
            <p className="font-semibold text-danger">
              This will take stock below zero
            </p>
            <ul className="mt-1 space-y-0.5 text-[13px]">
              {negativeProjections.map(({ productId, product, projected }) => (
                <li key={productId}>
                  <span className="font-semibold">{product.name}</span> —
                  currently {formatStock(product)}, this edit leaves{" "}
                  {formatStock({ ...product, quantityOnHand: projected })}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-sub text-[13px]">
              Record the edit anyway — the count is what needs fixing, not the
              edit. Recount these after.
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
                : "Record edit anyway"
              : isEditing
                ? "Save Changes"
                : "Save Delivery"}
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
            {confirmingDelete && deleteNegativeProjections.length > 0 && (
              <div className="mt-2 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
                <p className="font-semibold text-danger">
                  This will take stock below zero
                </p>
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  {deleteNegativeProjections.map(
                    ({ productId, product, projected }) => (
                      <li key={productId}>
                        <span className="font-semibold">{product.name}</span> —
                        currently {formatStock(product)}, deleting this entry
                        leaves{" "}
                        {formatStock({ ...product, quantityOnHand: projected })}
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
