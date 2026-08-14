import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";

test("the invariant holds when the ledger sums to the cached count", async () => {
  const t = setupTest();
  const productId = await aProductHolding(t, 20);

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId, unitLabel: "pc", quantity: 8 }],
  });

  await expectCacheMatchesLedger(t, productId);
});

test("the invariant fails when the cache has drifted from the ledger", async () => {
  const t = setupTest();
  const productId = await aProductHolding(t, 20);

  // Move the cached count without a matching movement — exactly the drift the
  // assertion exists to catch. `products.update` no longer accepts
  // `quantityOnHand` at all (that escape hatch is closed), so drift can only
  // be simulated by reaching under the public API, which is also the only way
  // it could happen for real now.
  await t.run(async (ctx) => {
    await ctx.db.patch(productId, { quantityOnHand: 19 });
  });

  await expect(expectCacheMatchesLedger(t, productId)).rejects.toThrow();
});
