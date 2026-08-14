/**
 * The below-zero check, extracted once so a cart, a delivery/pull-out edit
 * diff, and the server mutations that mirror them all judge a set of lines
 * the same way — netted per product, not line by line, so two lines of one
 * product (or a raised line beside a dropped one) can't cancel out unseen.
 * This is what makes the check safe to re-key once a cart can hold more than
 * one line per product: the summing lives here instead of six hand-rolled
 * copies, one of which would otherwise quietly stop catching it.
 *
 * `delta` is signed the way a ledger movement is: positive adds stock,
 * negative removes it. A caller working in "quantity taken" terms (a sale, a
 * pull-out) passes `-quantity`; a caller already holding a signed net delta
 * (an edit diff) passes it straight through.
 *
 * A product absent from `products` is skipped rather than treated as a zero
 * count — every caller already knows to leave out products it can't or
 * shouldn't judge (a deleted product still named on an old ledger line), and
 * defaulting to zero here would turn "unknown" into a false warning.
 */

export type OversoldLine<ProductId> = {
  productId: ProductId;
  delta: number;
};

export type ProductCount<ProductId> = {
  productId: ProductId;
  quantityOnHand: number;
};

export type Oversold<ProductId> = {
  productId: ProductId;
  quantityOnHand: number;
  projected: number;
};

export function findOversold<ProductId>(
  lines: OversoldLine<ProductId>[],
  products: ProductCount<ProductId>[],
): Oversold<ProductId>[] {
  const netDeltaByProduct = new Map<ProductId, number>();
  for (const line of lines) {
    netDeltaByProduct.set(
      line.productId,
      (netDeltaByProduct.get(line.productId) ?? 0) + line.delta,
    );
  }

  const countByProduct = new Map(
    products.map((p) => [p.productId, p.quantityOnHand]),
  );

  const result: Oversold<ProductId>[] = [];
  for (const [productId, delta] of netDeltaByProduct) {
    const quantityOnHand = countByProduct.get(productId);
    if (quantityOnHand === undefined) continue;
    const projected = quantityOnHand + delta;
    if (projected < 0) {
      result.push({ productId, quantityOnHand, projected });
    }
  }
  return result;
}
