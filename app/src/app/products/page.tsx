"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArchivedSection } from "../ArchivedSection";
import { StockStatusPill } from "../StockStatusPill";

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  // One query covering both sections — `include: "withArchived"` — split
  // client-side into active and archived, rather than a second `list` call
  // for the collapsed section that would re-run the same server-side scan.
  const allProducts =
    useQuery(api.products.list, {
      search: search || undefined,
      include: "withArchived",
    }) ?? [];
  const products = allProducts.filter((p) => p.archivedAt == null);
  const archivedProducts = allProducts.filter((p) => p.archivedAt != null);
  const createProduct = useMutation(api.products.create);

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("");
  const [adding, setAdding] = useState(false);

  const canAdd = name.trim() && Number(sellingPrice) > 0;

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setAdding(true);
    await createProduct({
      name: name.trim(),
      sellingPrice: Number(sellingPrice),
      lowStockThreshold: lowStockThreshold
        ? Number(lowStockThreshold)
        : undefined,
    });
    setName("");
    setSellingPrice("");
    setLowStockThreshold("");
    setAdding(false);
    setFormOpen(false);
  }

  return (
    <main className="flex-1 p-3.5 space-y-3">
      <h2 className="mt-1 mb-1 text-lg font-semibold">Products</h2>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search products…"
        className="w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-[15px]"
      />

      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full rounded-xl bg-accent py-2.5 font-semibold text-accent-ink"
        >
          + Add Product
        </button>
      ) : (
        <form onSubmit={handleAdd} className="card space-y-2.5 p-3">
          <div>
            <label
              htmlFor="product-name"
              className="text-sub block text-[13px] mb-1"
            >
              Name
            </label>
            <input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
            />
          </div>
          <div>
            <label
              htmlFor="product-selling-price"
              className="text-sub block text-[13px] mb-1"
            >
              Selling price
            </label>
            <input
              id="product-selling-price"
              type="number"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0"
              className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
            />
          </div>
          <p className="text-sub text-[13px]">
            Starts at 0 in stock — log a delivery on the Movements tab to add
            stock once it&apos;s saved.
          </p>
          <div>
            <label
              htmlFor="product-low-stock-threshold"
              className="text-sub block text-[13px] mb-1"
            >
              Low-stock threshold override (optional)
            </label>
            <input
              id="product-low-stock-threshold"
              type="number"
              value={lowStockThreshold}
              onChange={(e) => setLowStockThreshold(e.target.value)}
              placeholder="Uses global default"
              className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="card flex-1 py-2.5 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding || !canAdd}
              className="flex-1 rounded-xl bg-accent py-2.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {products.map((p) => (
          <Link
            key={p._id}
            href={`/products/${p._id}`}
            className="card flex items-center justify-between px-3 py-3"
          >
            <div>
              <div className="font-semibold">{p.name}</div>
              <div className="text-sub text-[13px]">
                ₱{p.sellingPrice.toFixed(2)} · {p.quantityOnHand} in stock
              </div>
            </div>
            <StockStatusPill status={p.lowStockStatus} />
          </Link>
        ))}
        {products.length === 0 && (
          <p className="text-sub text-center py-8">No products found</p>
        )}
      </div>

      <ArchivedSection count={archivedProducts.length}>
        {archivedProducts.map((p) => (
          <Link
            key={p._id}
            href={`/products/${p._id}`}
            className="card flex items-center justify-between px-3 py-3 opacity-70"
          >
            <div className="font-semibold">{p.name}</div>
            <span className="pill archived">Archived</span>
          </Link>
        ))}
      </ArchivedSection>
    </main>
  );
}
