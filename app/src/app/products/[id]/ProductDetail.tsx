"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { formatTime, signed } from "../../format";
import { StockStatusPill } from "../../StockStatusPill";
import { WindowedDayList } from "../../WindowedDayList";

// Derived from the query rather than restated, so a new field — or a new stock
// status — reaches this form without anyone remembering to widen a type here.
type Product = NonNullable<FunctionReturnType<typeof api.products.get>>;

type LedgerRow = FunctionReturnType<
  typeof api.stockMovements.listForProduct
>[number];

const LEDGER_HEADER_H = 30;
const LEDGER_ROW_H = 58;
const LEDGER_VIEWPORT_H = 420;

const LEDGER_LABEL: Record<LedgerRow["type"], string> = {
  opening: "Opening balance",
  delivery: "Delivery",
  pullout: "Pull-out",
  sale: "Sale",
};

export function ProductDetail({ productId }: { productId: Id<"products"> }) {
  const product = useQuery(api.products.get, { id: productId });

  if (product === undefined) {
    return <main className="text-sub flex-1 p-4">Loading...</main>;
  }
  if (product === null) {
    return <main className="text-sub flex-1 p-4">Product not found</main>;
  }

  return <ProductForm key={product._id} product={product} />;
}

function ProductForm({ product }: { product: Product }) {
  const updateProduct = useMutation(api.products.update);
  const removeProduct = useMutation(api.products.remove);
  const router = useRouter();

  const [name, setName] = useState(product.name);
  const [sellingPrice, setSellingPrice] = useState(
    String(product.sellingPrice),
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(
    product.lowStockThreshold != null ? String(product.lowStockThreshold) : "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canSave = name.trim() && Number(sellingPrice) > 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    await updateProduct({
      id: product._id,
      name: name.trim(),
      sellingPrice: Number(sellingPrice),
      lowStockThreshold: lowStockThreshold ? Number(lowStockThreshold) : null,
    });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    await removeProduct({ id: product._id });
    router.push("/products");
  }

  return (
    <main className="flex-1 p-3.5 space-y-3">
      <Link href="/products" className="mb-1 inline-block text-xl">
        &larr;
      </Link>

      <form onSubmit={handleSave} className="card space-y-2.5 p-3">
        <div>
          <label
            htmlFor="edit-name"
            className="text-sub block text-[13px] mb-1"
          >
            Name
          </label>
          <input
            id="edit-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label
              htmlFor="edit-selling-price"
              className="text-sub block text-[13px] mb-1"
            >
              Selling price
            </label>
            <input
              id="edit-selling-price"
              type="number"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
            />
          </div>
          <div className="flex-1">
            <div className="text-sub block text-[13px] mb-1">Qty on hand</div>
            <div className="px-2.5 py-2.5 text-[15px] font-semibold">
              {product.quantityOnHand}
            </div>
          </div>
        </div>
        <Link href="/movements" className="text-accent block text-[13px]">
          Log a delivery to change this count →
        </Link>
        <div>
          <label
            htmlFor="edit-low-stock-threshold"
            className="text-sub block text-[13px] mb-1"
          >
            Low-stock threshold override (optional)
          </label>
          <input
            id="edit-low-stock-threshold"
            type="number"
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
            placeholder="Uses global default"
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <StockStatusPill
          status={product.lowStockStatus}
          className="inline-block"
        />
        <button
          type="submit"
          disabled={saving || !canSave}
          className="w-full rounded-xl bg-accent py-2.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>

      <div className="flex gap-2">
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
              : "Delete Product"}
        </button>
      </div>

      <ProductLedger productId={product._id} />
    </main>
  );
}

/**
 * Every `stockMovements` row for this product, newest first under day
 * headings — the answer to "why does it say N?" sitting directly under N.
 * Reuses the Movements tab's day-grouped windowed list so a year of history
 * renders as cheaply here as it does there.
 */
function ProductLedger({ productId }: { productId: Id<"products"> }) {
  const rows = useQuery(api.stockMovements.listForProduct, { productId });

  return (
    <div className="space-y-2">
      <h3 className="text-sub text-[13px] font-semibold uppercase tracking-wide">
        Ledger
      </h3>
      <WindowedDayList
        rows={rows ?? []}
        headerH={LEDGER_HEADER_H}
        rowH={LEDGER_ROW_H}
        viewportH={LEDGER_VIEWPORT_H}
        empty={rows === undefined ? "Loading…" : "No movements yet"}
        renderRow={(row) => <LedgerRowView row={row} />}
      />
    </div>
  );
}

function ledgerContext(row: LedgerRow): string | null {
  if (row.type === "sale" && row.lineTotal !== undefined) {
    return `₱${row.lineTotal.toFixed(2)}`;
  }
  if (row.type === "pullout" && row.reasonCategory) {
    return row.reasonNotes
      ? `${row.reasonCategory} — ${row.reasonNotes}`
      : row.reasonCategory;
  }
  // No supplier field exists yet — see schema.ts's note on the `deliveries`
  // table — but the row's context slot is here, ready for the suppliers
  // ticket to fill in without touching layout.
  if (row.type === "delivery") return "No supplier yet";
  return null;
}

function LedgerRowView({ row }: { row: LedgerRow }) {
  const context = ledgerContext(row);
  const changeColor =
    row.netChange > 0
      ? "text-accent"
      : row.netChange < 0
        ? "text-danger"
        : "text-sub";

  return (
    <div className="flex h-full w-full items-center justify-between px-3">
      <div className="min-w-0">
        <div className="truncate text-[14px] font-semibold">
          {LEDGER_LABEL[row.type]}
        </div>
        <div className="text-sub truncate text-[11px]">
          {formatTime(row.createdAt)}
          {context ? ` · ${context}` : ""}
        </div>
      </div>
      <div className="shrink-0 pl-3 text-right">
        <div className={`font-bold ${changeColor}`}>
          {signed(row.netChange)}
        </div>
        <div className="text-sub text-[11px]">→ {row.runningBalance}</div>
      </div>
    </div>
  );
}
