import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
  type TestConvex,
} from "./test.helpers";

// No public mutation writes the ledger yet, so this test seeds the row
// directly. Every later ticket drives it through its own mutations instead.
async function addSaleMovement(
  t: TestConvex,
  productId: Id<"products">,
  quantity: number,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("stockMovements", {
      type: "sale",
      productId,
      quantity,
      createdAt: Date.now(),
    });
  });
}

test("the invariant holds when the ledger sums to the cached count", async () => {
  const t = setupTest();
  const productId = await aProductHolding(t, 20);

  await addSaleMovement(t, productId, -8);
  await t.mutation(api.products.update, { id: productId, quantityOnHand: 12 });

  await expectCacheMatchesLedger(t, productId);
});

test("the invariant fails when the cache has drifted from the ledger", async () => {
  const t = setupTest();
  const productId = await aProductHolding(t, 20);

  // Move the cached count without a matching movement — exactly the drift the
  // assertion exists to catch.
  await t.mutation(api.products.update, { id: productId, quantityOnHand: 19 });

  await expect(expectCacheMatchesLedger(t, productId)).rejects.toThrow();
});
