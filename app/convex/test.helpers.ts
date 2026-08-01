/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

// The Convex bundler skips any file whose name contains more than one dot, so
// this module and every `*.test.ts` beside it stay out of the deployed function
// set. Apply the same rule here — vite's glob has no working extglob — so
// convex-test loads the real functions and nothing else. `_generated` is exempt:
// convex-test needs it to locate the root of the function tree.
const modules = Object.fromEntries(
  Object.entries(import.meta.glob("./**/*.*s")).filter(([path]) => {
    if (path.startsWith("./_generated/")) return true;
    const base = path.split("/").pop() ?? "";
    return (base.match(/\./g) ?? []).length <= 1;
  }),
);

/** A fresh in-memory deployment, seeded with nothing. */
export function setupTest() {
  return convexTest(schema, modules);
}

type TestConvex = ReturnType<typeof setupTest>;

/**
 * The invariant this whole feature exists to protect: a product's cached
 * `quantityOnHand` is the sum of its `stockMovements` rows, never a number
 * anyone typed. Reach for this after any sequence of ledger writes.
 */
export async function expectCacheMatchesLedger(
  t: TestConvex,
  productId: Id<"products">,
) {
  const { name, quantityOnHand, ledgerSum } = await t.run(async (ctx) => {
    const product = await ctx.db.get(productId);
    if (!product) throw new Error(`No product with id ${productId}`);

    const movements = await ctx.db
      .query("stockMovements")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .collect();

    return {
      name: product.name,
      quantityOnHand: product.quantityOnHand,
      ledgerSum: movements.reduce((sum, m) => sum + m.quantity, 0),
    };
  });

  expect(
    quantityOnHand,
    `cached quantityOnHand for "${name}" should equal its ledger sum`,
  ).toBe(ledgerSum);
}
