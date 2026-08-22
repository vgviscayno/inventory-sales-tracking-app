/**
 * The Negative projection check, extracted once. The callers include a cart, a
 * Delivery edit diff, and a Pull-out edit diff. The delete path on both movement
 * sheets is a caller, and so are the server mutations that mirror them. All of
 * them judge a set of Lines the same way.
 * The check nets the Lines per product, and not Line by Line. Two Lines of one
 * product therefore cannot cancel out unseen. Neither can a raised Line beside
 * a dropped one.
 * The summing lives here, and not in a copy per caller. One such copy would
 * otherwise stop catching the case once a cart holds more than one Line per
 * product.
 *
 * `delta` carries the sign a Movement carries: positive adds stock, negative
 * removes it. A caller that works in "quantity taken" terms passes
 * `-quantity`. A Sale and a Pull-out are two such callers. A caller that
 * already holds a signed net delta passes it through, as an edit diff does.
 *
 * The loop skips a product absent from `products`. It does not read the
 * absence as a zero count. Every caller already leaves out the products it
 * cannot judge. A deleted product still named on an old Ledger row is one such
 * product. A zero here would turn "unknown" into a false warning.
 */

export type ProjectionLine<ProductId> = {
  productId: ProductId;
  delta: number;
};

export type ProductCount<ProductId> = {
  productId: ProductId;
  quantityOnHand: number;
};

export type NegativeProjection<ProductId> = {
  productId: ProductId;
  quantityOnHand: number;
  projected: number;
};

export function findNegativeProjections<ProductId>(
  lines: ProjectionLine<ProductId>[],
  products: ProductCount<ProductId>[],
): NegativeProjection<ProductId>[] {
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

  const result: NegativeProjection<ProductId>[] = [];
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
