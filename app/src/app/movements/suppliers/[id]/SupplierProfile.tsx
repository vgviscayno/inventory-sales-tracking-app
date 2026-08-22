"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

// This type comes from the query, and does not restate it. See the identical
// note on the `Customer` type in `CustomerProfile.tsx`.
type Supplier = NonNullable<FunctionReturnType<typeof api.suppliers.get>>;

export function SupplierProfile({
  supplierId,
}: {
  supplierId: Id<"suppliers">;
}) {
  const supplier = useQuery(api.suppliers.get, { id: supplierId });

  if (supplier === undefined) {
    return <main className="text-sub flex-1 p-4">Loading...</main>;
  }
  if (supplier === null) {
    return <main className="text-sub flex-1 p-4">Supplier not found</main>;
  }

  return <SupplierPage key={supplier._id} supplier={supplier} />;
}

function SupplierPage({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const supplierId = supplier._id;
  const updateSupplier = useMutation(api.suppliers.update);
  const archiveSupplier = useMutation(api.suppliers.archive);
  const unarchiveSupplier = useMutation(api.suppliers.unarchive);
  const deleteSupplier = useMutation(api.suppliers.remove);

  const [name, setName] = useState(supplier.name);
  const [notes, setNotes] = useState(supplier.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Delete is one way, so it takes a two-tap confirm, the same as a customer's
  // and a product's. The button stays disabled until somebody archives the
  // supplier.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isArchived = supplier.archivedAt != null;
  // A supplier carries no balance and no second condition. The archived state
  // is the whole gate, unlike a customer's.
  const deleteBlockedReason = isArchived ? null : "Archive first to delete";

  const canSave = name.trim().length > 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    await updateSupplier({
      id: supplierId,
      name: name.trim(),
      notes: notes.trim() || null,
    });
    setSaving(false);
  }

  // Nothing gates Archive. The reasoning is the same as in `customers.archive`.
  async function handleArchive() {
    setArchiving(true);
    await archiveSupplier({ id: supplierId });
    setArchiving(false);
  }

  async function handleUnarchive() {
    setArchiving(true);
    await unarchiveSupplier({ id: supplierId });
    setArchiving(false);
  }

  // Delete is for good. There is no undo, so the navigation away is part of
  // the action.
  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    await deleteSupplier({ id: supplierId });
    router.push("/movements/suppliers");
  }

  return (
    <main className="flex-1 p-3.5 space-y-1">
      <Link href="/movements/suppliers" className="mb-2.5 inline-block text-xl">
        &larr;
      </Link>

      <form onSubmit={handleSave} className="card mb-3.5 space-y-2.5 p-3">
        <div>
          <label
            htmlFor="supplier-name"
            className="text-sub block text-[13px] mb-1"
          >
            Name
          </label>
          <input
            id="supplier-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <div>
          <label
            htmlFor="supplier-notes"
            className="text-sub block text-[13px] mb-1"
          >
            Notes (optional)
          </label>
          <textarea
            id="supplier-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. bought from the palengke, ask for Nita"
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        {isArchived && (
          <span className="pill archived inline-block">Archived</span>
        )}
        <button
          type="submit"
          disabled={saving || !canSave}
          className="w-full rounded-xl bg-accent py-2.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>

      {isArchived ? (
        <div className="mb-3.5 space-y-2">
          <button
            type="button"
            onClick={handleUnarchive}
            disabled={archiving}
            className="w-full rounded-xl border border-line py-2.5 font-semibold"
          >
            {archiving ? "Unarchiving..." : "Unarchive Supplier"}
          </button>
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
              disabled={deleting || deleteBlockedReason !== null}
              className={`flex-1 rounded-xl border py-2.5 font-semibold disabled:opacity-50 ${
                confirmingDelete
                  ? "bg-danger border-danger text-white"
                  : "text-danger border-line"
              }`}
            >
              {deleting
                ? "Deleting..."
                : confirmingDelete
                  ? "Confirm Delete"
                  : "Delete Supplier"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleArchive}
          disabled={archiving}
          className="mb-3.5 w-full rounded-xl border border-line py-2.5 font-semibold text-danger"
        >
          {archiving ? "Archiving..." : "Archive Supplier"}
        </button>
      )}
    </main>
  );
}
