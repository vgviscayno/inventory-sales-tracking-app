/**
 * The one place a stock status turns into words and colour. A negative count
 * and a low count carry different messages. One says "this count is wrong,
 * recount", and the other says "order more". The two must never drift into
 * looking alike, which is what three hand-rolled copies of this cascade would
 * eventually do.
 */
export type StockStatus = "negative" | "low" | "ok";

export function StockStatusPill({
  status,
  className = "",
}: {
  // `withStatus` in `products.ts` sets `lowStockStatus` to undefined for an
  // archived product. It does not compute a status nobody should read.
  status: StockStatus | undefined;
  className?: string;
}) {
  if (status === "negative") {
    return (
      <span className={`pill negative ${className}`}>below zero — recount</span>
    );
  }
  if (status === "low") {
    return <span className={`pill utang ${className}`}>low</span>;
  }
  return null;
}
