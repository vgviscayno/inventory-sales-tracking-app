"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { buildLedger } from "../../../prototype/ledger";
// PROTOTYPE ONLY — throwaway, resolving:
// INV-18 (Movement history surface) — https://linear.app/inventory-sales-tracking/issue/INV-18
// Remove this block (and the ./prototype directory) when folding the winner in.
import { PrototypeSwitcher } from "../../../prototype/PrototypeSwitcher";
import { VariantA } from "./prototype/VariantA";
import { VariantB } from "./prototype/VariantB";
import { VariantC } from "./prototype/VariantC";

const PROTOTYPE_VARIANTS = [
  { key: "A", label: "Product page IS the ledger (rev 2)" },
  { key: "B", label: "Movements tab, grouped entries" },
  { key: "C", label: "Both surfaces, line-level edit" },
];

type Product = {
  _id: Id<"products">;
  name: string;
  sellingPrice: number;
  quantityOnHand: number;
  lowStockThreshold?: number;
  lowStockStatus: "low" | "ok";
};

export function ProductDetail({ productId }: { productId: Id<"products"> }) {
  const product = useQuery(api.products.get, { id: productId });

  // PROTOTYPE ONLY — the stub ledger is built from every product so grouped
  // entries span more than one, the way real deliveries do.
  const allProducts = useQuery(api.products.list, {});
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant");
  const ledger = useMemo(() => buildLedger(allProducts ?? []), [allProducts]);

  if (product === undefined) {
    return <main className="text-sub flex-1 p-4">Loading...</main>;
  }
  if (product === null) {
    return <main className="text-sub flex-1 p-4">Product not found</main>;
  }

  if (variant) {
    return (
      <>
        {variant === "A" && <VariantA product={product} ledger={ledger} />}
        {variant === "B" && <VariantB product={product} ledger={ledger} />}
        {variant === "C" && <VariantC product={product} ledger={ledger} />}
        <PrototypeSwitcher variants={PROTOTYPE_VARIANTS} current={variant} />
      </>
    );
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
  const [quantityOnHand, setQuantityOnHand] = useState(
    String(product.quantityOnHand),
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(
    product.lowStockThreshold != null ? String(product.lowStockThreshold) : "",
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canSave =
    name.trim() &&
    Number(sellingPrice) > 0 &&
    quantityOnHand.trim() !== "" &&
    Number(quantityOnHand) >= 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    await updateProduct({
      id: product._id,
      name: name.trim(),
      sellingPrice: Number(sellingPrice),
      quantityOnHand: Number(quantityOnHand),
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
            <label
              htmlFor="edit-quantity"
              className="text-sub block text-[13px] mb-1"
            >
              Qty on hand
            </label>
            <input
              id="edit-quantity"
              type="number"
              value={quantityOnHand}
              onChange={(e) => setQuantityOnHand(e.target.value)}
              className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
            />
          </div>
        </div>
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
        {product.lowStockStatus === "low" && (
          <span className="pill utang inline-block">currently low</span>
        )}
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
