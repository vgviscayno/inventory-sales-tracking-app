// Not a `*.test.ts` file, but it calls `import.meta.glob` below, which is the
// only reason the directive is ever needed.
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// The Convex bundler leaves test files and this helper module out of the
// deployed function set. Apply the same rule here — vite's glob has no working
// extglob — so convex-test loads the real functions and nothing else.
const isTestModule = (path: string) =>
  /\.test\.\w+$/.test(path) || /(^|\/)test\.helpers\.\w+$/.test(path);

const modules = Object.fromEntries(
  Object.entries(import.meta.glob("./**/*.*s")).filter(
    ([path]) => !isTestModule(path),
  ),
);

/** A fresh in-memory deployment, seeded with nothing. */
export function setupTest() {
  return convexTest(schema, modules);
}

export type TestConvex = ReturnType<typeof setupTest>;

/**
 * A product created through the public mutation, holding `quantityOnHand` —
 * with the opening movement that accounts for it, so the product satisfies
 * `expectCacheMatchesLedger` from birth. `quantityOnHand` is positional
 * because it is the point of the fixture; `overrides` covers everything else.
 */
export async function aProductHolding(
  t: TestConvex,
  quantityOnHand: number,
  overrides: { name?: string; sellingPrice?: number } = {},
) {
  const productId = await t.mutation(api.products.create, {
    name: "Coke 1.5L",
    sellingPrice: 75,
    quantityOnHand,
    ...overrides,
  });

  // No public mutation writes the ledger yet; deferred to the stock-movements
  // ticket, which will seed opening stock through its own mutation.
  await t.run(async (ctx) => {
    await ctx.db.insert("stockMovements", {
      type: "opening",
      productId,
      quantity: quantityOnHand,
      createdAt: Date.now(),
    });
  });

  return productId;
}

/**
 * The invariant this whole feature exists to protect: a product's cached
 * `quantityOnHand` is the sum of its `stockMovements` rows, never a number
 * anyone typed. Reach for this after any sequence of ledger writes.
 */
export async function expectCacheMatchesLedger(
  t: TestConvex,
  productId: Id<"products">,
) {
  const product = await t.query(api.products.get, { id: productId });
  if (!product) throw new Error(`No product with id ${productId}`);

  // No public query reads the ledger yet; deferred to the stock-movements
  // ticket, which will expose it.
  const movements = await t.run(async (ctx) =>
    ctx.db
      .query("stockMovements")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .collect(),
  );

  expect(
    product.quantityOnHand,
    `cached quantityOnHand for "${product.name}" should equal its ledger sum`,
  ).toBe(movements.reduce((sum, m) => sum + m.quantity, 0));
}
