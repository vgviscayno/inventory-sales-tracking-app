"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { CustomerPicker } from "./CustomerPicker";
import { StockStatusPill } from "./StockStatusPill";

/**
 * A cart holds what she rang up — nothing about the product itself. Name,
 * price and count are read live off the products query at render, so the
 * warning is judged against the count as it stands now, not as it stood when
 * the item was tapped. A stale count is what would let a sale reach the server
 * unwarned, get refused, and strand her at the counter.
 */
type CartLine = {
  productId: Id<"products">;
  quantity: number;
};

export default function RegisterPage() {
  const [search, setSearch] = useState("");
  // Unfiltered, and searched client-side: the cart needs live counts for
  // products the search box has scrolled out of view.
  const allProducts = useQuery(api.products.list, {}) ?? [];
  const products = search
    ? allProducts.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase()),
      )
    : allProducts;
  const createSale = useMutation(api.sales.create);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "utang">("cash");
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Whether she has been shown the below-zero warning yet — the click that sets
  // it is the warning, and the next one is the consent. Cleared whenever the
  // cart changes, so consent never carries over to a sale she has not seen.
  const [warned, setWarned] = useState(false);

  function addToCart(product: (typeof products)[number]) {
    setWarned(false);
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product._id);
      if (existing) {
        return prev.map((l) =>
          l.productId === product._id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { productId: product._id, quantity: 1 }];
    });
  }

  function setQuantity(productId: Id<"products">, quantity: number) {
    setWarned(false);
    setCart((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.productId !== productId)
        : prev.map((l) => (l.productId === productId ? { ...l, quantity } : l)),
    );
  }

  // Each cart line joined to the product as it stands right now. A product
  // deleted mid-sale drops out of both the display and the save.
  const lines = cart.flatMap((line) => {
    const product = allProducts.find((p) => p._id === line.productId);
    return product ? [{ ...line, product }] : [];
  });

  const total = lines.reduce(
    (sum, l) => sum + l.product.sellingPrice * l.quantity,
    0,
  );
  // Lines this sale would drive below zero. They warn — they never block. The
  // customer is at the counter holding the goods, so refusing the write buys an
  // unrecorded sale and a permanently wrong utang balance.
  const oversold = lines.filter((l) => l.quantity > l.product.quantityOnHand);
  const canCheckout =
    lines.length > 0 && (paymentMethod === "cash" || customerId !== null);

  useEffect(() => {
    if (!checkoutOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCheckoutOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [checkoutOpen]);

  async function completeSale() {
    if (oversold.length > 0 && !warned) {
      setWarned(true);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await createSale({
        customerId:
          paymentMethod === "utang" ? (customerId ?? undefined) : undefined,
        paymentMethod,
        items: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
        })),
        allowNegative: warned,
      });
      setCart([]);
      setCheckoutOpen(false);
      setPaymentMethod("cash");
      setCustomerId(null);
      setWarned(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      // The server refused, so it is telling her something the client's counts
      // did not — stock moved under her between render and save. Arm the
      // confirm on its message rather than leaving her stuck: the whole point
      // is that no refusal is ever the last word at the counter.
      setWarned(true);
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
                <StockStatusPill
                  status={p.lowStockStatus}
                  className="mt-1 inline-block"
                />
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
              {lines.map((l) => (
                <div
                  key={l.productId}
                  className="flex items-center justify-between gap-2"
                >
                  <div>
                    <div>{l.product.name}</div>
                    <div className="text-sub text-[13px]">
                      ₱{l.product.sellingPrice.toFixed(2)} each
                    </div>
                    {l.quantity > l.product.quantityOnHand && (
                      <div className="text-danger text-xs">
                        Only {l.product.quantityOnHand} on hand
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

            {/* Only when the client's own counts show the overdraw. On the
                server-refusal path `oversold` is empty and the error above is
                the warning — claiming a below-zero line the counts don't show
                would be a lie. */}
            {warned && oversold.length > 0 && (
              <div className="mt-3 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
                <p className="font-semibold text-danger">
                  This will take stock below zero
                </p>
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  {oversold.map((l) => (
                    <li key={l.productId}>
                      <span className="font-semibold">{l.product.name}</span> —
                      only {l.product.quantityOnHand} on hand, selling{" "}
                      {l.quantity} (leaves{" "}
                      {l.product.quantityOnHand - l.quantity})
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-sub text-[13px]">
                  Record the sale anyway — the count is what needs fixing, not
                  the sale. Recount these after.
                </p>
              </div>
            )}

            <button
              type="button"
              disabled={!canCheckout || submitting}
              onClick={completeSale}
              className={`mt-3.5 w-full rounded-xl py-3.5 font-bold text-accent-ink disabled:bg-[#d6d3d1] ${
                warned ? "bg-danger" : "bg-accent"
              }`}
            >
              {submitting
                ? "Completing..."
                : warned
                  ? "Record sale anyway"
                  : "Complete Sale"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
