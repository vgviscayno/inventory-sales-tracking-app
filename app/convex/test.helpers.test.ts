import { expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import {
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
  type TestConvex,
} from "./test.helpers";

// No public mutation writes the ledger yet, so these two tests seed rows
// directly. Every later ticket drives it through its own mutations instead.
async function addOpeningMovement(
  t: TestConvex,
  productId: Id<"products">,
  quantity: number,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("stockMovements", {
      type: "opening",
      productId,
      quantity,
      createdAt: Date.now(),
    });
  });
}

test("the invariant holds when the ledger sums to the cached count", async () => {
  const t = setupTest();
  const productId = await aProductHolding(t, 12);

  await addOpeningMovement(t, productId, 20);
  await addOpeningMovement(t, productId, -8);

  await expectCacheMatchesLedger(t, productId);
});

test("the invariant fails when the cache has drifted from the ledger", async () => {
  const t = setupTest();
  const productId = await aProductHolding(t, 12);

  await addOpeningMovement(t, productId, 11);

  await expect(expectCacheMatchesLedger(t, productId)).rejects.toThrow();
});
