"use client";

// This picker mirrors CustomerPicker's search-or-add shape. It adds the one
// thing a Delivery needs and a Sale's customer picker never does. An archived
// supplier can be the one already attached to the Delivery under edit.
// `suppliers.list` returns active rows only. A second query, `suppliers.get`,
// therefore fetches the selected id and merges it in here. That query bypasses
// the lifecycle filter.
// This is the whole "excluded from search, included by id" rule. There is no
// third list mode, only a second query keyed on `value` alone.

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
  // This query fires only when the selection is absent from the active list.
  // The common case pays nothing, and covers an active supplier and no pick.
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
      // This gap sits between a pick and `suppliers.get` resolving it. It is
      // brief, because the query above is already in flight.
      return <div className="card px-3 py-2.5 text-sub">Loading…</div>;
    }
    return (
      <div className="card flex items-center justify-between px-3 py-2.5">
        <span className="flex items-center gap-1.5 font-medium">
          {selected.name}
          {selected.deletedAt != null ? (
            <span className="pill deleted">Deleted</span>
          ) : selected.archivedAt != null ? (
            <span className="pill archived">Archived</span>
          ) : null}
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
          {/* A match only ever comes from the active list, so an archived
              supplier's exact name never suppresses this row. Somebody who
              types it gets a fresh row, and not the old supplier back. */}
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
