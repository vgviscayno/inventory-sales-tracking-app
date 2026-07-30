"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function CustomerPicker({
  value,
  onChange,
}: {
  value: Id<"customers"> | null;
  onChange: (id: Id<"customers"> | null) => void;
}) {
  const customers = useQuery(api.customers.list) ?? [];
  const createCustomer = useMutation(api.customers.create);
  const [query, setQuery] = useState("");

  const matches = customers.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));
  const selected = customers.find((c) => c._id === value);

  if (selected) {
    return (
      <div className="card flex items-center justify-between px-3 py-2.5">
        <span className="font-medium">{selected.name}</span>
        <button className="text-accent font-semibold" onClick={() => onChange(null)}>
          change
        </button>
      </div>
    );
  }

  async function handleCreate() {
    if (!query.trim()) return;
    const id = await createCustomer({ name: query.trim() });
    onChange(id);
    setQuery("");
  }

  return (
    <div className="space-y-1.5">
      <label className="text-sub block text-[13px]">Customer</label>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search or add customer name"
        className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
      />
      {query && (
        <div className="card max-h-40 divide-y divide-line overflow-y-auto">
          {matches.map((c) => (
            <button
              key={c._id}
              className="block w-full px-3 py-2 text-left"
              onClick={() => onChange(c._id)}
            >
              {c.name}
            </button>
          ))}
          {!matches.some((c) => c.name.toLowerCase() === query.trim().toLowerCase()) && (
            <button className="text-accent block w-full px-3 py-2 text-left font-semibold" onClick={handleCreate}>
              + Add &quot;{query.trim()}&quot; as new customer
            </button>
          )}
        </div>
      )}
    </div>
  );
}
