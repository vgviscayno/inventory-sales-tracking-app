"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CustomerPicker } from "./CustomerPicker";

type CartLine = {
  productId: Id<"products">;
  name: string;
  unitPrice: number;
  quantity: number;
  quantityOnHand: number;
};

export default function RegisterPage() {
  const [search, setSearch] = useState("");
  const products =
    useQuery(api.products.list, { search: search || undefined }) ?? [];
  const createSale = useMutation(api.sales.create);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "utang">("cash");
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addToCart(product: (typeof products)[number]) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product._id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product._id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          productId: product._id,
          name: product.name,
          unitPrice: product.sellingPrice,
          quantity: 1,
          quantityOnHand: product.quantityOnHand,
        },
      ];
    });
  }

  function setQuantity(productId: Id<"products">, quantity: number) {
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    );
  }

  const total = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  const hasOversell = cart.some((l) => l.quantity > l.quantityOnHand);
  const canCheckout =
    cart.length > 0 &&
    !hasOversell &&
    (paymentMethod === "cash" || customerId !== null);

  useEffect(() => {
    if (!checkoutOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCheckoutOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [checkoutOpen]);

  async function completeSale() {
    setSubmitting(true);
    setError(null);
    try {
      await createSale({
        customerId:
          paymentMethod === "utang" ? (customerId ?? undefined) : undefined,
        paymentMethod,
        items: cart.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
        })),
      });
      setCart([]);
      setCheckoutOpen(false);
      setPaymentMethod("cash");
      setCustomerId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col pb-24">
      <div className="p-3.5 space-y-2.5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products…"
          className="w-full rounded-[10px] border border-line bg-card px-3 py-2.5 text-[15px]"
        />
        <div className="grid grid-cols-2 gap-2">
          {products.map((p) => {
            const inCart = cart.find((l) => l.productId === p._id);
            return (
              <button
                key={p._id}
                type="button"
                onClick={() => addToCart(p)}
                className={`card relative p-3 text-left ${inCart ? "border-accent" : ""}`}
              >
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-sub text-[13px]">
                  ₱{p.sellingPrice.toFixed(2)} · {p.quantityOnHand} left
                </div>
                {p.lowStockStatus === "low" && (
                  <span className="pill utang mt-1 inline-block">low</span>
                )}
                {inCart && (
                  <span className="absolute top-2 right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-ink">
                    {inCart.quantity}
                  </span>
                )}
              </button>
            );
          })}
          {products.length === 0 && (
            <p className="col-span-2 text-center text-sub py-8">
              No products found
            </p>
          )}
        </div>
      </div>

      {cart.length > 0 && !checkoutOpen && (
        <div className="fixed left-0 right-0 bottom-[70px] mx-auto max-w-[480px] px-3.5">
          <button
            type="button"
            onClick={() => setCheckoutOpen(true)}
            className="card flex w-full items-center justify-between px-3 py-3 shadow-[0_4px_16px_rgba(0,0,0,.12)]"
          >
            <span className="font-semibold">
              {cart.reduce((n, l) => n + l.quantity, 0)} item(s){" "}
              <span className="text-sub font-normal">₱{total.toFixed(2)}</span>
            </span>
            <span>▲ Checkout</span>
          </button>
        </div>
      )}

      {checkoutOpen && (
        // biome-ignore lint/a11y/noStaticElementInteractions: mouse-only dismiss; Escape handled in useEffect above
        // biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only dismiss; Escape handled in useEffect above
        <div
          className="fixed inset-0 z-20 bg-black/35"
          onClick={() => setCheckoutOpen(false)}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops click propagation, not a user affordance */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: only stops click propagation, not a user affordance */}
          <div
            className="card fixed inset-x-0 bottom-0 z-[21] mx-auto max-h-[80vh] max-w-[480px] overflow-y-auto rounded-t-2xl rounded-b-none px-3.5 pt-4 pb-[76px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-line" />
            <h3 className="mb-2.5 font-semibold">Checkout</h3>

            <div className="space-y-2">
              {cart.map((l) => (
                <div
                  key={l.productId}
                  className="flex items-center justify-between gap-2"
                >
                  <div>
                    <div>{l.name}</div>
                    <div className="text-sub text-[13px]">
                      ₱{l.unitPrice.toFixed(2)} each
                    </div>
                    {l.quantity > l.quantityOnHand && (
                      <div className="text-danger text-xs">
                        Only {l.quantityOnHand} in stock
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity(l.productId, l.quantity - 1)}
                      className="h-[30px] w-[30px] rounded-lg border border-line bg-card"
                    >
                      −
                    </button>
                    <span className="min-w-[18px] text-center font-semibold">
                      {l.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity(l.productId, l.quantity + 1)}
                      className="h-[30px] w-[30px] rounded-lg border border-line bg-card"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="my-3 flex justify-between border-t border-line pt-2.5 text-lg font-bold">
              <span>Total</span>
              <span>₱{total.toFixed(2)}</span>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                className={`flex-1 rounded-xl py-2.5 font-semibold ${
                  paymentMethod === "cash"
                    ? "bg-accent text-accent-ink"
                    : "card"
                }`}
                onClick={() => setPaymentMethod("cash")}
              >
                Cash
              </button>
              <button
                type="button"
                className={`flex-1 rounded-xl py-2.5 font-semibold ${
                  paymentMethod === "utang"
                    ? "bg-accent text-accent-ink"
                    : "card"
                }`}
                onClick={() => setPaymentMethod("utang")}
              >
                Utang
              </button>
            </div>

            {paymentMethod === "utang" && (
              <div className="mt-2.5">
                <CustomerPicker value={customerId} onChange={setCustomerId} />
              </div>
            )}

            {error && <p className="text-danger text-sm">{error}</p>}

            <button
              type="button"
              disabled={!canCheckout || submitting}
              onClick={completeSale}
              className="mt-3.5 w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
            >
              {submitting ? "Completing..." : "Complete Sale"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
