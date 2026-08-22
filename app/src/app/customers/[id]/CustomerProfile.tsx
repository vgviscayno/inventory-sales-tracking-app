"use client";

import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

// This type comes from the query, and does not restate it. See the identical
// note on the `Product` type in `ProductDetail.tsx`.
type Customer = NonNullable<FunctionReturnType<typeof api.customers.get>>;

export function CustomerProfile({
  customerId,
}: {
  customerId: Id<"customers">;
}) {
  const customer = useQuery(api.customers.get, { id: customerId });

  if (customer === undefined) {
    return <main className="text-sub flex-1 p-4">Loading...</main>;
  }
  if (customer === null) {
    return <main className="text-sub flex-1 p-4">Customer not found</main>;
  }

  return <CustomerPage key={customer._id} customer={customer} />;
}

function CustomerPage({ customer }: { customer: Customer }) {
  const router = useRouter();
  const customerId = customer._id;
  const sales = useQuery(api.sales.listForCustomer, { customerId }) ?? [];
  const payments = useQuery(api.payments.listForCustomer, { customerId }) ?? [];
  const recordPayment = useMutation(api.payments.create);
  const updateCustomer = useMutation(api.customers.update);
  const archiveCustomer = useMutation(api.customers.archive);
  const unarchiveCustomer = useMutation(api.customers.unarchive);
  const deleteCustomer = useMutation(api.customers.remove);

  const [name, setName] = useState(customer.name);
  const [customerNotes, setCustomerNotes] = useState(customer.notes ?? "");
  const [savingDetails, setSavingDetails] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Delete is one way, so it takes a two-tap confirm, the same as a product's.
  // The button is already disabled until the balance is zero.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isArchived = customer.archivedAt != null;
  // This check mirrors the server's gate, so what the button shows and what it
  // may do never disagree. See `customers.remove`. The gate holds in either
  // direction. An overpayment blocks the delete exactly as an Utang balance
  // does.
  const deleteBlockedReason =
    customer.balance === 0
      ? null
      : customer.balance > 0
        ? `₱${customer.balance.toFixed(2)} owed — settle first`
        : `₱${(-customer.balance).toFixed(2)} overpaid — settle first`;

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const canSaveDetails = name.trim().length > 0;

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!canSaveDetails) return;
    setSavingDetails(true);
    await updateCustomer({
      id: customerId,
      name: name.trim(),
      notes: customerNotes.trim() || null,
    });
    setSavingDetails(false);
  }

  // Nothing gates Archive. A customer who owes money archives on one tap, the
  // same tap as any other customer. The balance still renders on the row and in
  // the Archived section header, so it needs no warning first.
  async function handleArchive() {
    setArchiving(true);
    await archiveCustomer({ id: customerId });
    setArchiving(false);
  }

  async function handleUnarchive() {
    setArchiving(true);
    await unarchiveCustomer({ id: customerId });
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
    await deleteCustomer({ id: customerId });
    router.push("/customers");
  }

  async function handleRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    const value = Number(amount);
    if (!value || value <= 0) return;
    setSubmitting(true);
    await recordPayment({
      customerId,
      amount: value,
      paidAt: Date.now(),
      notes: notes || undefined,
    });
    setAmount("");
    setNotes("");
    setSubmitting(false);
    setFormOpen(false);
  }

  const history = [
    ...sales
      .filter((s) => s.paymentMethod === "utang")
      .map((s) => ({
        type: "charge" as const,
        id: s._id,
        amount: s.totalAmount,
        at: s.createdAt,
      })),
    ...payments.map((p) => ({
      type: "payment" as const,
      id: p._id,
      amount: p.amount,
      at: p.paidAt,
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <main className="flex-1 p-3.5 space-y-1">
      <Link href="/customers" className="mb-2.5 inline-block text-xl">
        &larr;
      </Link>

      <div className="card mb-3.5 p-3">
        <div
          className="text-[22px] font-bold"
          style={{
            color: customer.balance > 0 ? "var(--utang)" : "var(--ink)",
          }}
        >
          ₱{customer.balance.toFixed(2)}
        </div>
        <div className="text-sub">current balance</div>
      </div>

      <form
        onSubmit={handleSaveDetails}
        className="card mb-3.5 space-y-2.5 p-3"
      >
        <div>
          <label
            htmlFor="customer-name"
            className="text-sub block text-[13px] mb-1"
          >
            Name
          </label>
          <input
            id="customer-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        <div>
          <label
            htmlFor="customer-notes"
            className="text-sub block text-[13px] mb-1"
          >
            Notes (optional)
          </label>
          <textarea
            id="customer-notes"
            value={customerNotes}
            onChange={(e) => setCustomerNotes(e.target.value)}
            rows={2}
            className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
          />
        </div>
        {isArchived && (
          <span className="pill archived inline-block">Archived</span>
        )}
        <button
          type="submit"
          disabled={savingDetails || !canSaveDetails}
          className="w-full rounded-xl bg-accent py-2.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
        >
          {savingDetails ? "Saving..." : "Save Changes"}
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
            {archiving ? "Unarchiving..." : "Unarchive Customer"}
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
                  : "Delete Customer"}
            </button>
          </div>
          {deleteBlockedReason && (
            <p className="text-sub text-[13px]">{deleteBlockedReason}</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleArchive}
          disabled={archiving}
          className="mb-3.5 w-full rounded-xl border border-line py-2.5 font-semibold text-danger"
        >
          {archiving ? "Archiving..." : "Archive Customer"}
        </button>
      )}

      <h3 className="mb-2 text-sm font-semibold">Record a payment</h3>
      {!formOpen ? (
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          className="w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink"
        >
          Record Payment
        </button>
      ) : (
        <form onSubmit={handleRecordPayment} className="space-y-2.5">
          <div>
            <label
              htmlFor="payment-amount"
              className="text-sub block text-[13px] mb-1"
            >
              Amount received
            </label>
            <input
              id="payment-amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-[10px] border border-line bg-card px-2.5 py-2.5 text-[15px]"
            />
          </div>
          <div>
            <label
              htmlFor="payment-notes"
              className="text-sub block text-[13px] mb-1"
            >
              Notes (optional)
            </label>
            <input
              id="payment-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              disabled={submitting || !amount}
              className="flex-1 rounded-xl bg-accent py-2.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <h3 className="mt-4.5 mb-2 text-sm font-semibold">History</h3>
      <div>
        {history.map((h) => (
          <div
            key={`${h.type}-${h.id}`}
            className="flex justify-between border-b border-line py-1.5"
          >
            <span className="text-sub">
              {h.type === "charge" ? "Utang sale" : "Payment"}
            </span>
            <span
              style={{
                color: h.type === "charge" ? "var(--utang)" : "var(--accent)",
              }}
            >
              {h.type === "charge" ? "+" : "−"}₱{h.amount.toFixed(2)}
            </span>
          </div>
        ))}
        {history.length === 0 && (
          <p className="text-sub text-center py-8">No activity yet</p>
        )}
      </div>
    </main>
  );
}
