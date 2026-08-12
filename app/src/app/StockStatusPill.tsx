/**
 * The one place a stock status turns into words and colour. A negative count
 * and a low count are different messages — "this count is wrong, recount"
 * versus "order more" — and they must never drift into looking alike, which is
 * what three hand-rolled copies of this cascade would eventually do.
 */
export type StockStatus = "negative" | "low" | "ok";

export function StockStatusPill({
  status,
  className = "",
}: {
  // Undefined for an archived product — `products.ts`'s `withStatus` omits
  // the field there rather than computing a status nobody should read.
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
