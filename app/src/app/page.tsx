"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { roundCentavos } from "../../convex/money";
import { findOversold } from "../../convex/oversold";
import { CustomerPicker } from "./CustomerPicker";
import { StockStatusPill } from "./StockStatusPill";

/**
 * A cart holds what she rang up — nothing about the product itself. Name,
 * price and count are read live off the products query at render, so the
 * warning is judged against the count as it stands now, not as it stood when
 * the item was tapped. A stale count is what would let a sale reach the server
 * unwarned, get refused, and strand her at the counter.
 *
 * Keyed by `(productId, unitLabel)`, not `productId` alone — trays and pieces
 * of the same egg are separately countable and separately priced, so tapping
 * a product already in the cart under a different Unit has to open a new
 * line rather than pile onto the existing one.
 */
type CartLine = {
  productId: Id<"products">;
  unitLabel: string;
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

  function addToCart(
    product: (typeof products)[number],
    unit: (typeof products)[number]["units"][number],
  ) {
    setWarned(false);
    setCart((prev) => {
      const existing = prev.find(
        (l) => l.productId === product._id && l.unitLabel === unit.label,
      );
      if (existing) {
        return prev.map((l) =>
          l.productId === product._id && l.unitLabel === unit.label
            ? { ...l, quantity: l.quantity + 1 }
            : l,
        );
      }
      return [
        ...prev,
        { productId: product._id, unitLabel: unit.label, quantity: 1 },
      ];
    });
  }

  function setQuantity(
    productId: Id<"products">,
    unitLabel: string,
    quantity: number,
  ) {
    setWarned(false);
    setCart((prev) =>
      quantity <= 0
        ? prev.filter(
            (l) => !(l.productId === productId && l.unitLabel === unitLabel),
          )
        : prev.map((l) =>
            l.productId === productId && l.unitLabel === unitLabel
              ? { ...l, quantity }
              : l,
          ),
    );
  }

  // Each cart line joined to the product and the specific Unit it was rung up
  // in, as they stand right now. A product deleted mid-sale, or a Unit
  // dropped from it, drops the line from both the display and the save.
  const lines = cart.flatMap((line) => {
    const product = allProducts.find((p) => p._id === line.productId);
    const unit = product?.units.find((u) => u.label === line.unitLabel);
    return product && unit ? [{ ...line, product, unit }] : [];
  });

  const total = lines.reduce(
    (sum, l) => sum + roundCentavos(l.unit.price * l.quantity),
    0,
  );
  // Lines this sale would drive below zero, netted per product in Base units
  // — two lines of one product, in the same Unit or different ones, are
  // judged on what the sale actually takes off the shelf. They warn — they
  // never block. The customer is at the counter holding the goods, so
  // refusing the write buys an unrecorded sale and a permanently wrong utang
  // balance.
  const oversold = findOversold(
    lines.map((l) => ({
      productId: l.productId,
      delta: -Math.round(l.quantity * l.unit.baseEquivalent),
    })),
    lines.map((l) => ({
      productId: l.productId,
      quantityOnHand: l.product.quantityOnHand,
    })),
  ).flatMap(({ productId, projected }) => {
    const product = allProducts.find((p) => p._id === productId);
    return product ? [{ productId, product, projected }] : [];
  });
  const oversoldProductIds = new Set(oversold.map((o) => o.productId));
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
          unitLabel: l.unitLabel,
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
            const cartLinesForProduct = cart.filter(
              (l) => l.productId === p._id,
            );
            // A single-Unit product taps as a whole tile, same as before
            // Units existed. A multi-Unit product — eggs sold by the piece
            // and by the tray — needs each Unit picked explicitly, so it
            // renders one small button per Unit instead.
            if (p.units.length === 1) {
              const unit = p.units[0];
              const inCart = cartLinesForProduct[0];
              return (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => addToCart(p, unit)}
                  className={`card relative p-3 text-left ${inCart ? "border-accent" : ""}`}
                >
                  <div className="text-sm font-semibold">{p.name}</div>
                  <div className="text-sub text-[13px]">
                    ₱{unit.price.toFixed(2)} · {p.quantityOnHand} left
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
            }
            return (
              <div key={p._id} className="card p-3 text-left">
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-sub text-[13px]">
                  {p.quantityOnHand} left
                </div>
                <StockStatusPill
                  status={p.lowStockStatus}
                  className="mt-1 mb-1.5 inline-block"
                />
                <div className="flex flex-wrap gap-1.5">
                  {p.units.map((unit) => {
                    const inCart = cartLinesForProduct.find(
                      (l) => l.unitLabel === unit.label,
                    );
                    return (
                      <button
                        key={unit.label}
                        type="button"
                        onClick={() => addToCart(p, unit)}
                        className={`relative rounded-lg border px-2 py-1 text-[12px] font-semibold ${
                          inCart
                            ? "border-accent bg-accent/10"
                            : "border-line bg-card"
                        }`}
                      >
                        {unit.label} · ₱{unit.price.toFixed(2)}
                        {inCart && (
                          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
                            {inCart.quantity}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                  key={`${l.productId}:${l.unitLabel}`}
                  className="flex items-center justify-between gap-2"
                >
                  <div>
                    <div>
                      {l.product.name}
                      {l.product.units.length > 1 && (
                        <span className="text-sub"> · {l.unitLabel}</span>
                      )}
                    </div>
                    <div className="text-sub text-[13px]">
                      ₱{l.unit.price.toFixed(2)} each
                    </div>
                    {oversoldProductIds.has(l.productId) && (
                      <div className="text-danger text-xs">
                        Only {l.product.quantityOnHand} on hand
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity(l.productId, l.unitLabel, l.quantity - 1)
                      }
                      className="h-[30px] w-[30px] rounded-lg border border-line bg-card"
                    >
                      −
                    </button>
                    <span className="min-w-[18px] text-center font-semibold">
                      {l.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity(l.productId, l.unitLabel, l.quantity + 1)
                      }
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
                  {oversold.map(({ productId, product, projected }) => (
                    <li key={productId}>
                      <span className="font-semibold">{product.name}</span> —
                      only {product.quantityOnHand} on hand, this sale leaves{" "}
                      {projected}
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
