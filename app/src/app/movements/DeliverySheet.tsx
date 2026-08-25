"use client";

// The `+ Delivery` bottom sheet. It deliberately follows the sale sheet of the
// Register (src/app/page.tsx), so the muscle memory transfers.
// Search a product by name. Tap a result to add a Line. Adjust with the
// steppers or a typed quantity. Drop a mis-tapped Line, and save.
//
// A product the catalog does not hold yet gets a step of its own. The sheet
// gives the whole surface to that step. The step then collapses the product
// into a Line, and every Line has one shape.
// Two things follow. A new product cannot crowd a row it does not fit. The
// step also has the room for a second Unit. A shipment of eggs therefore
// records as 10 trays.
//
// The same component reopens an existing Delivery for a correction. An
// `entryId` prefills the Lines from `getEntry` instead of an empty sheet. The
// save then routes through the diff in `editEntry`, and not `create`.
// The new-product step only makes sense while somebody logs a fresh shipment.
// The sheet hides its affordances during an edit, because a forgotten Line
// there names a product the catalog already holds.
//
// PulloutSheet.tsx mirrors this sheet, and the Register's sale sheet mirrors
// both. Neither takes the step. A Pull-out and a Sale move stock the shop
// already holds, so neither can create a product. Their Line lists also carry
// no `kind: "new"` row, so neither carries the layout defect this step fixes.

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { roundCentavos } from "../../../convex/money";
import { findNegativeProjections } from "../../../convex/negativeProjections";
import { formatStock } from "../../../convex/remainderReading";
import { formatCount, unitLabelFor } from "../../../convex/unitLabels";
import { SupplierPicker } from "../SupplierPicker";
import {
  countedIn,
  emptyDraft,
  extraUnitComplete,
  extraUnitPrice,
  isComplete,
  type NewProductDraft,
  toCreateLine,
} from "./newProductLine";
import { unitSuggestions } from "./unitSuggestions";

// A Line either names a product that already exists, or carries what a new
// product needs. The second kind arrives through the new-product step.
// `key` gives every kind a stable identity, for React and for the `bump`,
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
  | NewLine;

// A Line that carries a product this Delivery creates. Everything the product
// itself needs lives in the draft. See newProductLine.ts.
type NewLine = { kind: "new"; key: string } & NewProductDraft;

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
  // The new-product step, and which Line it is open on. `mode` separates a
  // product this step is putting into the delivery from one already in it, and
  // `original` is the Line the step opened with. Backing out of an edit
  // therefore reverts, and does not drop a Line that was fine before somebody
  // touched it.
  const [step, setStep] = useState<{
    key: string;
    mode: "create" | "edit";
    original: NewLine | null;
  } | null>(null);

  // A source of Line keys that does not read the clock. Two Lines added inside
  // one millisecond stay distinct.
  const nextKey = useRef(0);
  function takeKey(prefix: string) {
    nextKey.current += 1;
    return `${prefix}:${nextKey.current}`;
  }

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

  // The labels the new-product step offers. See unitSuggestions.ts.
  const suggestions = useMemo(
    () => unitSuggestions(allProducts),
    [allProducts],
  );

  function addExistingLine(productId: Id<"products">) {
    setWarned(false);
    const product = allProducts.find((p) => p._id === productId);
    const unitLabel = product?.defaultUnit.label ?? product?.baseUnitLabel;
    if (!unitLabel) return;
    setLines((prev) => [
      ...prev,
      {
        kind: "existing",
        key: takeKey(productId),
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

  // Open the step on a product this delivery is about to create. The Line goes
  // into the list first, so every later call reaches it by key alone.
  function openNewProductStep(name: string) {
    setWarned(false);
    const key = takeKey("new");
    setLines((prev) => [...prev, { kind: "new", key, ...emptyDraft(name) }]);
    setSearch("");
    setStep({ key, mode: "create", original: null });
  }

  function openEditStep(line: NewLine) {
    setStep({ key: line.key, mode: "edit", original: line });
  }

  // Back out of the step. A half-typed product was never in the delivery, so
  // it goes with the step. A reopened one returns to what the step opened
  // with.
  function closeStep(stepLine: NewLine) {
    if (!step) return;
    if (step.mode === "create") {
      if (!isComplete(stepLine)) removeLine(stepLine.key);
    } else if (step.original) {
      patchNewLine(stepLine.key, step.original);
    }
    setStep(null);
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

  function patchNewLine(key: string, fields: Partial<NewLine>) {
    setWarned(false);
    setLines((prev) =>
      prev.map((l) =>
        l.key === key && l.kind === "new" ? { ...l, ...fields } : l,
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
    | NewLine;

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
  // A `kind: "new"` Line names a product that does not exist yet. It starts at
  // zero and this Delivery only adds to it, so it can carry no Negative
  // projection.
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
      resolvedLines.every((l) => l.kind !== "new" || isComplete(l)));

  const stepLine = step
    ? lines.find((l): l is NewLine => l.key === step.key && l.kind === "new")
    : undefined;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Escape leaves one surface at a time. It backs out of the new-product
      // step where the step is open, and closes the sheet otherwise. A single
      // Escape must not take the whole delivery with it.
      if (stepLine) {
        closeStep(stepLine);
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // No dependency list. The handler reads the step as it stands on this
    // render, so it re-registers on every render. A list here would hold an
    // Escape against a step that is already closed.
  });

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
                    kind: "existing" as const,
                    productId: l.productId,
                    unitLabel: l.unitLabel,
                    quantity: l.quantity,
                  }
                : toCreateLine(l),
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
        className="card fixed inset-x-0 bottom-0 z-21 mx-auto max-h-[85vh] max-w-120 overflow-y-auto rounded-t-2xl rounded-b-none px-3.5 pt-4 pb-19"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />

        {stepLine ? (
          <NewProductStep
            line={stepLine}
            mode={step?.mode ?? "create"}
            suggestions={suggestions}
            onPatch={(fields) => patchNewLine(stepLine.key, fields)}
            onBump={(by) => bump(stepLine.key, by)}
            onBack={() => closeStep(stepLine)}
            onConfirm={() => setStep(null)}
          />
        ) : (
          <>
            <h3 className="mb-2.5 font-semibold">
              {isEditing ? "Edit delivery" : "Log a delivery"}
            </h3>

            <div className="flex gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products to add…"
                className="min-w-0 flex-1 rounded-[10px] border border-line bg-card px-3 py-2.5 text-[15px]"
              />
              {/* The way to a new product that does not go through a search
                  finding nothing. A near-miss on a name the catalog already
                  holds used to hide the affordance completely. */}
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => openNewProductStep(trimmedSearch)}
                  className="text-accent shrink-0 rounded-[10px] border border-accent px-3 text-[14px] font-semibold"
                >
                  + New
                </button>
              )}
            </div>

            {trimmedSearch && (
              <div className="card mt-1.5 max-h-52 divide-y divide-line overflow-y-auto">
                {matches.map((p) => (
                  <button
                    key={p._id}
                    type="button"
                    onClick={() => addExistingLine(p._id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                  >
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="text-sub shrink-0 text-[13px]">
                      {formatStock(p)} on hand
                    </span>
                  </button>
                ))}
                {!isEditing && (
                  <button
                    type="button"
                    onClick={() => openNewProductStep(trimmedSearch)}
                    className="text-accent flex w-full items-center gap-1.5 px-3 py-2.5 text-left font-semibold"
                  >
                    <span>+</span>
                    <span className="min-w-0 truncate">
                      Add “{trimmedSearch}” as a new product
                    </span>
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

                // A new product's Line carries the New pill, its name, and the
                // Unit its count is read in. Everything else the step settled
                // stays on the step. A price and a Base equivalence here
                // truncate, and read as a row nobody can take in at a glance.
                if (l.kind === "new") {
                  return (
                    <div
                      key={l.key}
                      className="flex items-center justify-between gap-2 rounded-lg p-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => openEditStep(l)}
                        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                      >
                        <span className="pill new shrink-0">New</span>
                        <span className="min-w-0">
                          <span className="block truncate">{l.name}</span>
                          <span className="text-sub block text-[12px]">
                            tap to edit
                          </span>
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="text-sub text-[13px]">
                          {unitLabelFor(l.quantity, countedIn(l) || "unit")}
                        </span>
                        <Stepper
                          quantity={l.quantity}
                          onBump={(by) => bump(l.key, by)}
                          onSet={(n) => setQuantity(l.key, n)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(l.key)}
                        className="text-danger shrink-0 px-1 text-lg leading-none"
                        aria-label={`Remove ${l.name}`}
                      >
                        ×
                      </button>
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
                      <Stepper
                        quantity={l.quantity}
                        onBump={(by) => bump(l.key, by)}
                        onSet={(n) => setQuantity(l.key, n)}
                      />
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
                );
              })}
              {resolvedLines.length === 0 && (
                <p className="text-sub py-4 text-center text-[13px]">
                  {isEditing
                    ? "Search above and tap a product to add it to this delivery"
                    : "Search above and tap a product, or start a new one"}
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
                          <span className="font-semibold">{product.name}</span>{" "}
                          — currently {formatStock(product)}, deleting leaves{" "}
                          {formatStock({
                            ...product,
                            quantityOnHand: projected,
                          })}
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
                server-refusal path `negativeProjections` is empty and the error
                above is the warning. */}
            {warned &&
              negativeProjections.length > 0 &&
              !isDeleteViaEmptySave && (
                <div className="mt-3 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
                  <p className="font-semibold text-danger">
                    This will take stock below zero
                  </p>
                  <ul className="mt-1 space-y-0.5 text-[13px]">
                    {negativeProjections.map(
                      ({ productId, product, projected }) => (
                        <li key={productId}>
                          <span className="font-semibold">{product.name}</span>{" "}
                          — currently {formatStock(product)}, this edit leaves{" "}
                          {formatStock({
                            ...product,
                            quantityOnHand: projected,
                          })}
                        </li>
                      ),
                    )}
                  </ul>
                  <p className="mt-1.5 text-sub text-[13px]">
                    Record the edit anyway — the count is what needs fixing, not
                    the edit. Recount these after.
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
                            <span className="font-semibold">
                              {product.name}
                            </span>{" "}
                            — currently {formatStock(product)}, deleting this
                            entry leaves{" "}
                            {formatStock({
                              ...product,
                              quantityOnHand: projected,
                            })}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The − / count / + control every Line carries. */
function Stepper({
  quantity,
  onBump,
  onSet,
}: {
  quantity: number;
  onBump: (by: number) => void;
  onSet: (n: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={() => onBump(-1)}
        className="h-7.5 w-7.5 rounded-lg border border-line bg-card"
      >
        −
      </button>
      <input
        type="number"
        value={quantity}
        onChange={(e) => onSet(Math.max(1, Number(e.target.value)))}
        className="w-14 rounded-lg border border-line bg-card px-1.5 py-1 text-center font-semibold"
      />
      <button
        type="button"
        onClick={() => onBump(1)}
        className="h-7.5 w-7.5 rounded-lg border border-line bg-card"
      >
        +
      </button>
    </div>
  );
}

/**
 * Unit labels the catalog already uses. A tap fills the field beside them.
 * The list the caller passes decides what is on offer. The two fields of the
 * step pass different lists. See unitSuggestions.ts.
 */
function UnitSuggestions({
  suggestions,
  current,
  onPick,
}: {
  suggestions: string[];
  current: string;
  onPick: (label: string) => void;
}) {
  const shown = suggestions.slice(0, 5);
  if (shown.length === 0) return null;
  return (
    <>
      <div className="text-sub mt-2 text-[12px]">
        Already used in your catalog
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {shown.map((label) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(label)}
            className={`rounded-full border px-2.5 py-1 text-[13px] font-semibold ${
              current.trim().toLowerCase() === label.toLowerCase()
                ? "border-accent bg-accent text-accent-ink"
                : "border-line bg-card text-sub"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * The step that declares a product the catalog does not hold yet. It takes the
 * whole sheet. Each field the product needs therefore gets a bounded block of
 * its own with a label on it. The Line it collapses into carries none of these
 * controls.
 * The step also sets the Unit the shipment is counted in. That is the one
 * choice here which belongs to the Delivery and not to the product.
 */
function NewProductStep({
  line,
  mode,
  suggestions,
  onPatch,
  onBump,
  onBack,
  onConfirm,
}: {
  line: NewLine;
  mode: "create" | "edit";
  suggestions: { baseUnits: string[]; allUnits: string[] };
  onPatch: (fields: Partial<NewLine>) => void;
  onBump: (by: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const unit = line.unitLabel.trim();
  const extra = line.extraLabel.trim();
  const extraDone = extraUnitComplete(line);
  const perExtra = Number(line.extraEquivalent);
  const readIn = countedIn(line);
  const ready = isComplete(line);

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the delivery"
          className="text-sub -ml-1 px-1 text-xl leading-none"
        >
          ‹
        </button>
        <h3 className="font-semibold">
          {mode === "edit" ? line.name || "New product" : "New product"}
        </h3>
        <span className="pill new ml-auto">New</span>
      </div>

      <label
        className="block text-[13px] font-semibold"
        htmlFor="new-product-name"
      >
        Name
      </label>
      <input
        id="new-product-name"
        value={line.name}
        onChange={(e) => onPatch({ name: e.target.value })}
        className="mt-1 w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-[15px]"
      />

      <div className="mt-3 rounded-xl border border-line p-2.5">
        <div className="text-[13px] font-semibold">Base unit</div>
        <p className="text-sub mt-0.5 text-[12px]">
          Every quantity this product’s stock is held in is counted in its Base
          unit. It locks once stock has moved, so pick one fine enough that
          everything sold comes to a whole number of it.
        </p>
        <input
          value={line.unitLabel}
          onChange={(e) => onPatch({ unitLabel: e.target.value })}
          placeholder="sack"
          aria-label="Base unit"
          className="mt-1.5 w-full rounded-lg border border-line bg-card px-2.5 py-2"
        />
        <UnitSuggestions
          suggestions={suggestions.baseUnits}
          current={line.unitLabel}
          onPick={(label) => onPatch({ unitLabel: label })}
        />
      </div>

      <div className="mt-2 rounded-xl border border-line p-2.5">
        <div className="text-[13px] font-semibold">
          Price per {unit || "unit"}
        </div>
        <div className="mt-1.5 flex items-center rounded-lg border border-line bg-card px-2.5">
          <span className="text-sub">₱</span>
          <input
            type="number"
            inputMode="decimal"
            value={line.price}
            onChange={(e) => onPatch({ price: e.target.value })}
            placeholder="0"
            aria-label="Price"
            className="w-full bg-transparent px-1 py-2"
          />
        </div>
      </div>

      {/* Stock is held in the Base unit, and a shipment does not arrive in it.
          A second Unit declared here is what lets the delivery be recorded as
          10 trays and not 300 pieces. */}
      {line.extraUnitOpen ? (
        <div className="mt-2 rounded-xl border border-line p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold">Another Unit</div>
            <button
              type="button"
              onClick={() =>
                onPatch({
                  extraUnitOpen: false,
                  extraLabel: "",
                  extraEquivalent: "",
                  extraPrice: "",
                  // The Unit this Line counted in is gone, so the count falls
                  // back to the Base unit.
                  recordIn: "base",
                })
              }
              aria-label="Remove the second Unit"
              className="text-danger px-1 text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="mt-1.5 flex gap-2">
            <div className="flex-1">
              <div className="text-sub text-[12px]">Unit</div>
              <input
                value={line.extraLabel}
                onChange={(e) => onPatch({ extraLabel: e.target.value })}
                placeholder="tray"
                aria-label="Second Unit"
                className="mt-0.5 w-full rounded-lg border border-line bg-card px-2 py-1.5"
              />
            </div>
            <div className="flex-1">
              <div className="text-sub truncate text-[12px]">
                = how many {unit || "base"}
              </div>
              <input
                type="number"
                inputMode="numeric"
                value={line.extraEquivalent}
                onChange={(e) => onPatch({ extraEquivalent: e.target.value })}
                placeholder="30"
                aria-label={`How many ${unit || "base units"} in one ${extra || "unit"}`}
                className="mt-0.5 w-full rounded-lg border border-line bg-card px-2 py-1.5"
              />
            </div>
            <div className="w-24">
              <div className="text-sub text-[12px]">Price</div>
              <div className="mt-0.5 flex items-center rounded-lg border border-line bg-card px-2">
                <span className="text-sub">₱</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={line.extraPrice}
                  onChange={(e) => onPatch({ extraPrice: e.target.value })}
                  placeholder="optional"
                  aria-label={`Price per ${extra || "unit"}`}
                  className="w-full bg-transparent px-1 py-1.5"
                />
              </div>
            </div>
          </div>
          <UnitSuggestions
            suggestions={suggestions.allUnits}
            current={line.extraLabel}
            onPick={(label) => onPatch({ extraLabel: label })}
          />
          {extraDone && (
            <p className="text-sub mt-2 text-[12px]">
              1 {extra} = {formatCount(perExtra, unit || "base unit")}
              {/* A blank price box gives the Unit the Base unit's price at
                  this Base equivalence. The figure shows here, so nobody
                  meets a price they did not type. */}
              {extraUnitPrice(line) === undefined &&
                `, and sells for ₱${roundCentavos(Number(line.price) * perExtra)}`}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onPatch({ extraUnitOpen: true })}
          className="text-accent mt-2 w-full rounded-xl border border-dashed border-line p-2.5 text-left text-[13px] font-semibold"
        >
          + Add another Unit
          <span className="text-sub block font-normal text-[12px]">
            Deliveries usually arrive in bulk. Add the Unit this one comes in —
            a tray, a sack, a case — and record {unit || "the stock"} by it
            instead.
          </span>
        </button>
      )}

      <div className="mt-2 rounded-xl border border-line p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[13px] font-semibold">
            Arriving on this delivery
          </div>
          <Stepper
            quantity={line.quantity}
            onBump={onBump}
            onSet={(n) => onPatch({ quantity: n })}
          />
        </div>
        {/* The count above is read in whichever Unit is picked here. The
            Base-unit echo underneath is what stops "10 trays" from being
            entered as a guess. */}
        {extraDone && (
          <>
            <div className="mt-2 flex gap-1.5">
              {[
                { key: "extra" as const, label: extra },
                { key: "base" as const, label: unit },
              ].map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  onClick={() => onPatch({ recordIn: choice.key })}
                  className={`flex-1 rounded-lg border px-2.5 py-1.5 text-[13px] font-semibold ${
                    line.recordIn === choice.key
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-line bg-card text-sub"
                  }`}
                >
                  {unitLabelFor(line.quantity, choice.label)}
                </button>
              ))}
            </div>
            <p className="text-sub mt-1.5 text-[12px]">
              {formatCount(line.quantity, readIn)}
              {line.recordIn === "extra" &&
                ` = ${formatCount(line.quantity * perExtra, unit)} on hand`}
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        disabled={!ready}
        onClick={onConfirm}
        className="mt-3.5 w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
      >
        {mode === "edit"
          ? "Save changes"
          : ready
            ? `Add ${formatCount(line.quantity, readIn)} to the delivery`
            : "Add to the delivery"}
      </button>
    </>
  );
}
