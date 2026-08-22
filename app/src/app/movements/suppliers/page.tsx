"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { ArchivedSection } from "../../ArchivedSection";

export default function SuppliersPage() {
  // One query covers both sections, and the split runs on the client. See the
  // identical note on the Customers list.
  const allSuppliers =
    useQuery(api.suppliers.list, { include: "withArchived" }) ?? [];
  const suppliers = allSuppliers.filter((s) => s.archivedAt == null);
  const archivedSuppliers = allSuppliers.filter((s) => s.archivedAt != null);
  const createSupplier = useMutation(api.suppliers.create);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    await createSupplier({ name: name.trim() });
    setName("");
    setAdding(false);
  }

  const sorted = [...suppliers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="flex-1 p-3.5 space-y-3">
      <Link href="/movements" className="mb-2.5 inline-block text-xl">
        &larr;
      </Link>

      <h2 className="mt-1 mb-1 text-lg font-semibold">Suppliers</h2>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New supplier name"
          className="flex-1 rounded-[10px] border border-line bg-card px-3 py-2"
        />
        <button
          type="submit"
          disabled={adding || !name.trim()}
          className="rounded-xl bg-accent px-4 py-2 font-semibold text-accent-ink disabled:bg-[#d6d3d1]"
        >
          Add
        </button>
      </form>

      <div className="space-y-2">
        {sorted.map((s) => (
          <Link
            key={s._id}
            href={`/movements/suppliers/${s._id}`}
            className="card flex items-center justify-between px-3 py-3"
          >
            <span className="font-semibold">{s.name}</span>
          </Link>
        ))}
        {sorted.length === 0 && (
          <p className="text-sub text-center py-8">No suppliers yet</p>
        )}
      </div>

      <ArchivedSection count={archivedSuppliers.length}>
        {archivedSuppliers.map((s) => (
          <Link
            key={s._id}
            href={`/movements/suppliers/${s._id}`}
            className="card flex items-center justify-between px-3 py-3 opacity-70"
          >
            <span className="font-semibold">{s.name}</span>
            <span className="pill archived">Archived</span>
          </Link>
        ))}
      </ArchivedSection>
    </main>
  );
}
