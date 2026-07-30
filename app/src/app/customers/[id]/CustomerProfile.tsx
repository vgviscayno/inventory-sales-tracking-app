"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export function CustomerProfile({
  customerId,
}: {
  customerId: Id<"customers">;
}) {
  const customer = useQuery(api.customers.get, { id: customerId });
  const sales = useQuery(api.sales.listForCustomer, { customerId }) ?? [];
  const payments = useQuery(api.payments.listForCustomer, { customerId }) ?? [];
  const recordPayment = useMutation(api.payments.create);

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  if (!customer) {
    return <main className="text-sub flex-1 p-4">Loading...</main>;
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
        <h2 className="text-lg font-semibold">{customer.name}</h2>
        <div
          className="mt-2 text-[22px] font-bold"
          style={{
            color: customer.balance > 0 ? "var(--utang)" : "var(--ink)",
          }}
        >
          ₱{customer.balance.toFixed(2)}
        </div>
        <div className="text-sub">current balance</div>
      </div>

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
