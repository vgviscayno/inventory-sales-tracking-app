"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { roundCentavos } from "../../convex/money";
import { findOversold } from "../../convex/oversold";
import { formatStock } from "../../convex/remainderReading";
import { unitLabelFor } from "../../convex/unitLabels";
import { CustomerPicker } from "./CustomerPicker";
import { StockStatusPill } from "./StockStatusPill";

/**
 * A cart holds what somebody rang up, and nothing about the product itself. The
 * render reads the name, the price, and the count live off the products query.
 * The warning therefore judges the count as it stands now, and not as it stood
 * when the item was tapped.
 * A stale count is what would let a Sale reach the server unwarned. The server
 * would refuse it, and the person would be stranded at the counter.
 *
 * The key is `(productId, unitLabel)` and not `productId` alone. Trays and
 * pieces of one egg are separately countable and separately priced. A tap on a
 * product already in the cart under a different Unit therefore opens a new
 * Line. It does not pile onto the existing one.
 */
type CartLine = {
  productId: Id<"products">;
  unitLabel: string;
  quantity: number;
};

export default function RegisterPage() {
  const [search, setSearch] = useState("");
  // This query filters nothing, and the search runs on the client. The cart
  // needs live counts for products the search box has scrolled out of view.
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
  // Whether the person has seen the Oversold warning yet. The click
  // that sets this flag is the warning, and the next click is the consent.
  // A change to the cart clears the flag, so consent never carries over to a
  // Sale nobody has seen.
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

  // This list joins each cart Line to its product and to the specific Unit it
  // was rung up in. Both stand as they are right now. A product deleted
  // mid-sale, or a Unit dropped from it, drops the Line from the display and
  // from the save.
  const lines = cart.flatMap((line) => {
    const product = allProducts.find((p) => p._id === line.productId);
    const unit = product?.units.find((u) => u.label === line.unitLabel);
    return product && unit ? [{ ...line, product, unit }] : [];
  });

  const total = lines.reduce(
    (sum, l) => sum + roundCentavos(l.unit.price * l.quantity),
    0,
  );
  // The products this sale would leave Oversold. The check nets the Lines
  // per product in Base units. Two Lines of one product therefore give one
  // judgement, whether they name the same Unit or different Units.
  // An Oversold warns. It never blocks the save. The customer waits
  // at the counter with the goods. A refused write costs the shop an
  // unrecorded sale and a wrong Utang balance.
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
      // The server refused, so it knows something the client's counts did not.
      // Stock moved between the render and the save. The catch arms the confirm
      // on the server's message, and does not leave the person stuck. No
      // refusal is ever the last word at the counter.
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
            const inCartDefault = cartLinesForProduct.find(
              (l) => l.unitLabel === p.defaultUnit.label,
            );
            // The Default unit taps as one big button that is obviously
            // pressable. That is the common case, and it takes one tap.
            // A multi-Unit product shows its other Units underneath, as smaller
            // buttons for the times somebody means one of those. Eggs sold by
            // the piece as well as the tray are such a product.
            // A single-Unit product has none of those smaller buttons, so it
            // shows the one button alone.
            // Each price spells out "per <unit>", so what it is priced in reads
            // at a glance.
            const otherUnits = p.units.filter(
              (u) => u.label !== p.defaultUnit.label,
            );
            return (
              <div key={p._id} className="card p-3 text-left">
                <div className="mb-1 text-sm font-semibold">{p.name}</div>
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-sub text-[12px]">
                    {formatStock(p)} left
                  </span>
                  <StockStatusPill status={p.lowStockStatus} />
                </div>
                <button
                  type="button"
                  onClick={() => addToCart(p, p.defaultUnit)}
                  className={`relative flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left shadow-sm transition active:scale-[.97] ${
                    inCartDefault
                      ? "border-accent bg-accent/10"
                      : "border-line bg-bg hover:border-accent/60"
                  }`}
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-lg font-bold leading-none text-accent">
                    +
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">
                      ₱{p.defaultUnit.price.toFixed(2)}
                    </span>
                    <span className="block text-sub text-[12px]">
                      per {p.defaultUnit.label}
                    </span>
                  </span>
                  {inCartDefault && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-ink">
                      {inCartDefault.quantity}
                    </span>
                  )}
                </button>
                {otherUnits.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {otherUnits.map((unit) => {
                      const inCart = cartLinesForProduct.find(
                        (l) => l.unitLabel === unit.label,
                      );
                      return (
                        <button
                          key={unit.label}
                          type="button"
                          onClick={() => addToCart(p, unit)}
                          className={`relative flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold shadow-sm transition active:scale-[.95] ${
                            inCart
                              ? "border-accent bg-accent/10 text-accent"
                              : "border-line bg-bg hover:border-accent/60"
                          }`}
                        >
                          <span className="text-accent">+</span>
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
                )}
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
                        <span className="text-sub">
                          {" "}
                          · {unitLabelFor(l.quantity, l.unitLabel)}
                        </span>
                      )}
                    </div>
                    <div className="text-sub text-[13px]">
                      ₱{l.unit.price.toFixed(2)} each
                    </div>
                    {oversoldProductIds.has(l.productId) && (
                      <div className="text-danger text-xs">
                        Only {formatStock(l.product)} on hand
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

            {/* This block shows only when the client's own counts show the
                Oversold. On the server-refusal path `oversold` is empty, and
                the error above is the warning. To claim an Oversold the counts
                do not show would be a lie. */}
            {warned && oversold.length > 0 && (
              <div className="mt-3 rounded-xl border border-danger bg-[#fef2f2] p-3 text-sm">
                <p className="font-semibold text-danger">
                  This will take stock below zero
                </p>
                <ul className="mt-1 space-y-0.5 text-[13px]">
                  {oversold.map(({ productId, product, projected }) => (
                    <li key={productId}>
                      <span className="font-semibold">{product.name}</span> —
                      only {formatStock(product)} on hand, this sale leaves{" "}
                      {formatStock({ ...product, quantityOnHand: projected })}
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
