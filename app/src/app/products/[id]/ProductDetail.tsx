"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { StockStatusPill } from "../../StockStatusPill";

// Derived from the query rather than restated, so a new field — or a new stock
// status — reaches this form without anyone remembering to widen a type here.
type Product = NonNullable<FunctionReturnType<typeof api.products.get>>;

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
    </main>
  );
}
