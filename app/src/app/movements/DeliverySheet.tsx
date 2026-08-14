"use client";

// The `+ Delivery` bottom sheet — deliberately built like the Register
// checkout sheet (src/app/page.tsx) so the muscle memory transfers: search a
// product by name, tap a result to add a line, adjust with steppers or a
// typed quantity, remove a mis-tapped line, save.
//
// The same component reopens an existing delivery for correction: passing
// `entryId` prefills its lines from `getEntry` instead of starting empty, and
// save routes through `editEntry`'s diff instead of `create`. Inline
// "+ Add as new product" only makes sense while logging a fresh shipment, so
// it's hidden once editing — a forgotten line here names a product already in
// the catalog.

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { findOversold } from "../../../convex/oversold";
import { SupplierPicker } from "../SupplierPicker";

// A line either names a product that already exists, or (once "+ Add as new
// product" is chosen) is still collecting the name and price it'll be
// created with — `key` gives both kinds a stable identity for React and for
// the bump/setQuantity/removeLine calls below, which don't otherwise care
// which kind they're touching. An existing line prefilled from an entry under
// edit carries `movementId` and the `originalQuantity` it opened with, so the
// diff sent to `editEntry` is judged against what this line actually was —
// not against the product's live count, which other entries may have moved
// since. A line's `key` is its `movementId` when it has one, so two prefilled
// lines for the same product (one entry can touch a product twice) stay
// distinct rather than colliding on `productId`.
type Line =
  | {
      kind: "existing";
      key: string;
      movementId?: Id<"stockMovements">;
      productId: Id<"products">;
      quantity: number;
      originalQuantity?: number;
    }
  | {
      kind: "deleted";
      key: string;
      movementId: Id<"stockMovements">;
      productId: Id<"products">;
      productName: string;
      quantity: number;
      originalQuantity: number;
    }
  | {
      kind: "new";
      key: string;
      name: string;
      sellingPrice: string;
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
  // Whether she has been shown the below-zero warning yet, cleared whenever
  // the lines change so consent never carries over to an edit she has not
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
  // query refreshes (e.g. a product she's not even touching gets renamed).
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
              quantity: l.quantity,
              originalQuantity: l.quantity,
            }
          : {
              kind: "deleted" as const,
              key: l.movementId,
              movementId: l.movementId,
              productId: l.productId,
              productName: l.productName,
              quantity: l.quantity,
              originalQuantity: l.quantity,
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
    setLines((prev) => {
      const existing = prev.find(
        (l) => l.kind === "existing" && l.productId === productId,
      );
      if (existing) {
        return prev.map((l) =>
          l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        { kind: "existing", key: productId, productId, quantity: 1 },
      ];
    });
    setSearch("");
  }

  function addNewProductLine(name: string) {
    setLines((prev) => [
      ...prev,
      {
        kind: "new",
        key: `new:${Date.now()}`,
        name,
        sellingPrice: "",
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

  function setNewProductSellingPrice(key: string, sellingPrice: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key && l.kind === "new" ? { ...l, sellingPrice } : l,
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

  // Net delta per product this save would cause, relative to what's already
  // on the ledger — zero for every line while logging a fresh delivery, since
  // every line there is new. Editing is what can turn a lowered or dropped
  // line into a loss of stock, so this is what the warning below is judged
  // against, not the raw quantity typed.
  const deltaLines: { productId: Id<"products">; delta: number }[] = [];
  for (const line of resolvedLines) {
    if (line.kind !== "existing") continue;
    deltaLines.push({
      productId: line.productId,
      delta: line.quantity - (line.originalQuantity ?? 0),
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
          delta: -original.quantity,
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
      delta: -l.quantity,
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
          Number(l.sellingPrice) > 0,
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

    if (oversold.length > 0 && !warned) {
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
                    quantity: l.quantity,
                  }
                : {
                    kind: "new",
                    name: l.name,
                    sellingPrice: Number(l.sellingPrice),
                    quantity: l.quantity,
                  },
            ),
          supplierId: supplierId ?? undefined,
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
                  {p.quantityOnHand} on hand
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
                      ×{l.quantity}
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
                    <input
                      type="number"
                      inputMode="decimal"
                      value={l.sellingPrice}
                      onChange={(e) =>
                        setNewProductSellingPrice(l.key, e.target.value)
                      }
                      placeholder="Price"
                      aria-label={`Selling price for ${l.name}`}
                      className="w-16 rounded-lg border border-line bg-card px-1.5 py-1 text-center font-semibold"
                    />
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
            {oversold.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[13px]">
                {oversold.map(({ productId, product, projected }) => (
                  <li key={productId}>
                    <span className="font-semibold">{product.name}</span> —
                    currently {product.quantityOnHand}, deleting leaves{" "}
                    {projected}
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
                  currently {product.quantityOnHand}, this edit leaves{" "}
                  {projected}
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
            {confirmingDelete && deleteOversold.length > 0 && (
              <div className="mt-2 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
                <p className="font-semibold text-danger">
                  This will take stock below zero
                </p>
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  {deleteOversold.map(({ productId, product, projected }) => (
                    <li key={productId}>
                      <span className="font-semibold">{product.name}</span> —
                      currently {product.quantityOnHand}, deleting this entry
                      leaves {projected}
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
