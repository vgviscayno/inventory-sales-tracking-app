"use client";

// The `+ Delivery` bottom sheet — deliberately built like the Register
// checkout sheet (src/app/page.tsx) so the muscle memory transfers: search a
// product by name, tap a result to add a line, adjust with steppers or a
// typed quantity, remove a mis-tapped line, save.

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// A line either names a product that already exists, or (once "+ Add as new
// product" is chosen) is still collecting the name and price it'll be
// created with — `key` gives both kinds a stable identity for React and for
// the bump/setQuantity/removeLine calls below, which don't otherwise care
// which kind they're touching.
type Line =
  | {
      kind: "existing";
      key: string;
      productId: Id<"products">;
      quantity: number;
    }
  | {
      kind: "new";
      key: string;
      name: string;
      sellingPrice: string;
      quantity: number;
    };

export function DeliverySheet({ onClose }: { onClose: () => void }) {
  const allProducts = useQuery(api.products.list, {}) ?? [];
  const createDelivery = useMutation(api.deliveries.create);

  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedSearch = search.trim();
  const matches = trimmedSearch
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
      )
    : [];

  function addExistingLine(productId: Id<"products">) {
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
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, quantity: Math.max(1, l.quantity + by) } : l,
      ),
    );
  }

  function setQuantity(key: string, quantity: number) {
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
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  // Existing lines joined to the product as it stands right now, dropping any
  // line whose product got deleted mid-edit; new lines pass through as-is —
  // there's no product to join to until save creates one.
  type ResolvedLine =
    | (Extract<Line, { kind: "existing" }> & {
        product: (typeof allProducts)[number];
      })
    | Extract<Line, { kind: "new" }>;

  const resolvedLines = lines.flatMap<ResolvedLine>((line) => {
    if (line.kind === "new") return [line];
    const product = allProducts.find((p) => p._id === line.productId);
    return product ? [{ ...line, product }] : [];
  });

  const canSave =
    resolvedLines.length > 0 &&
    resolvedLines.every(
      (l) => l.kind === "existing" || Number(l.sellingPrice) > 0,
    );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await createDelivery({
        lines: resolvedLines.map((l) =>
          l.kind === "existing"
            ? { kind: "existing", productId: l.productId, quantity: l.quantity }
            : {
                kind: "new",
                name: l.name,
                sellingPrice: Number(l.sellingPrice),
                quantity: l.quantity,
              },
        ),
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
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
        <h3 className="mb-2.5 font-semibold">Log a delivery</h3>

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
            {matches.length === 0 && (
              <button
                type="button"
                onClick={() => addNewProductLine(trimmedSearch)}
                className="text-accent flex w-full items-center px-3 py-2 text-left font-semibold"
              >
                + Add "{trimmedSearch}" as new product
              </button>
            )}
          </div>
        )}

        <div className="mt-3 space-y-2">
          {resolvedLines.map((l) => (
            <div
              key={l.key}
              className="flex items-center justify-between gap-2"
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {l.kind === "new" && (
                  <span className="pill new shrink-0">New</span>
                )}
                <div className="min-w-0 truncate">
                  {l.kind === "existing" ? l.product.name : l.name}
                </div>
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
                  aria-label={`Remove ${l.kind === "existing" ? l.product.name : l.name}`}
                >
                  ×
                </button>
              </div>
            </div>
          ))}
          {resolvedLines.length === 0 && (
            <p className="text-sub py-4 text-center text-[13px]">
              Search above and tap a product to add it to this delivery
            </p>
          )}
        </div>

        {error && <p className="text-danger mt-2 text-sm">{error}</p>}

        <button
          type="button"
          disabled={!canSave || saving}
          onClick={handleSave}
          className="mt-3.5 w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
        >
          {saving ? "Saving..." : "Save Delivery"}
        </button>
      </div>
    </div>
  );
}
