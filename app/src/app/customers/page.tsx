"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { ArchivedSection } from "../ArchivedSection";

export default function CustomersPage() {
  // One query covers both sections, and the split runs on the client. See the
  // identical note on the Products list.
  const allCustomers =
    useQuery(api.customers.list, { include: "withArchived" }) ?? [];
  const customers = allCustomers.filter((c) => c.archivedAt == null);
  const archivedCustomers = allCustomers.filter((c) => c.archivedAt != null);
  const archivedOwed = archivedCustomers.reduce(
    (sum, c) => sum + Math.max(c.balance, 0),
    0,
  );
  const createCustomer = useMutation(api.customers.create);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    await createCustomer({ name: name.trim() });
    setName("");
    setAdding(false);
  }

  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="flex-1 p-3.5 space-y-3">
      <h2 className="mt-1 mb-1 text-lg font-semibold">Customers</h2>

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New customer name"
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
        {sorted.map((c) => (
          <Link
            key={c._id}
            href={`/customers/${c._id}`}
            className="card flex items-center justify-between px-3 py-3"
          >
            <span className="font-semibold">{c.name}</span>
            <span
              className={c.balance > 0 ? "pill utang" : "text-sub text-[13px]"}
            >
              {c.balance > 0 ? `₱${c.balance.toFixed(2)} owed` : "settled"}
            </span>
          </Link>
        ))}
        {sorted.length === 0 && (
          <p className="text-sub text-center py-8">No customers yet</p>
        )}
      </div>

      <ArchivedSection
        count={archivedCustomers.length}
        subtitle={
          archivedOwed > 0 ? `₱${archivedOwed.toFixed(2)} owed` : undefined
        }
      >
        {archivedCustomers.map((c) => (
          <Link
            key={c._id}
            href={`/customers/${c._id}`}
            className="card flex items-center justify-between px-3 py-3 opacity-70"
          >
            <span className="font-semibold">{c.name}</span>
            <div className="flex items-center gap-2">
              {c.balance > 0 && (
                <span className="pill utang">₱{c.balance.toFixed(2)} owed</span>
              )}
              <span className="pill archived">Archived</span>
            </div>
          </Link>
        ))}
      </ArchivedSection>
    </main>
  );
}
