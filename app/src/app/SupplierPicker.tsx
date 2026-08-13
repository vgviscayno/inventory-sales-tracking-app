"use client";

// Mirrors CustomerPicker's search-or-add shape, plus the one thing a
// delivery needs that a sale's customer picker never has: an archived
// supplier can be the one already attached to the delivery under edit.
// `suppliers.list` only ever returns active rows, so the currently-selected
// id is fetched separately with `suppliers.get` — which bypasses lifecycle
// filtering — and merged in here. That's the whole "excluded from search,
// included by id" rule: no third list mode, just a second query keyed on
// `value` alone.

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function SupplierPicker({
  value,
  onChange,
}: {
  value: Id<"suppliers"> | null;
  onChange: (id: Id<"suppliers"> | null) => void;
}) {
  const suppliers = useQuery(api.suppliers.list, {}) ?? [];
  const selectedFromList = suppliers.find((s) => s._id === value);
  // Only fired when the selection isn't already in the active list — the
  // common case (an active supplier, or none picked) never pays for it.
  const selectedById = useQuery(
    api.suppliers.get,
    value !== null && !selectedFromList ? { id: value } : "skip",
  );
  const createSupplier = useMutation(api.suppliers.create);
  const [query, setQuery] = useState("");

  const matches = suppliers.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()),
  );
  const selected = selectedFromList ?? selectedById ?? undefined;

  if (value !== null) {
    if (!selected) {
      // Between picking a value and `suppliers.get` resolving it — brief,
      // since the query above is already in flight.
      return <div className="card px-3 py-2.5 text-sub">Loading…</div>;
    }
    return (
      <div className="card flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-1.5 font-medium">
          {selected.name}
          {selected.archivedAt != null && (
            <span className="pill archived">Archived</span>
          )}
        </span>
        <button
          type="button"
          className="text-accent font-semibold"
          onClick={() => onChange(null)}
        >
          change
        </button>
      </div>
    );
  }

  async function handleCreate() {
    if (!query.trim()) return;
    const id = await createSupplier({ name: query.trim() });
    onChange(id);
    setQuery("");
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor="supplier-query" className="text-sub block text-[13px]">
        Supplier
      </label>
      <input
        id="supplier-query"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search or add supplier name (optional)"
        className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
      />
      {query && (
        <div className="card max-h-40 divide-y divide-line overflow-y-auto">
          {matches.map((s) => (
            <button
              key={s._id}
              type="button"
              className="block w-full px-3 py-2 text-left"
              onClick={() => onChange(s._id)}
            >
              {s.name}
            </button>
          ))}
          {/* Matches only ever come from the active list, so an archived
              supplier's exact name never suppresses this — typing it offers
              a fresh row rather than resurrecting the old one. */}
          {!matches.some(
            (s) => s.name.toLowerCase() === query.trim().toLowerCase(),
          ) && (
            <button
              type="button"
              className="text-accent block w-full px-3 py-2 text-left font-semibold"
              onClick={handleCreate}
            >
              + Add &quot;{query.trim()}&quot; as new supplier
            </button>
          )}
        </div>
      )}
    </div>
  );
}
