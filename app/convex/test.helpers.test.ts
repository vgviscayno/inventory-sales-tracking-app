import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { expectCacheMatchesLedger, setupTest } from "./test.helpers";

type Test = ReturnType<typeof setupTest>;

// No public mutation writes the ledger yet, so these two tests seed rows
// directly. Every later ticket drives it through its own mutations instead.
async function addMovement(
  t: Test,
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

async function aProductHolding(t: Test, quantityOnHand: number) {
  return await t.mutation(api.products.create, {
    name: "Coke 1.5L",
    sellingPrice: 75,
    quantityOnHand,
  });
}

test("the invariant holds when the ledger sums to the cached count", async () => {
  const t = setupTest();
  const productId = await aProductHolding(t, 12);

  await addMovement(t, productId, 20);
  await addMovement(t, productId, -8);

  await expectCacheMatchesLedger(t, productId);
});

test("the invariant fails when the cache has drifted from the ledger", async () => {
  const t = setupTest();
  const productId = await aProductHolding(t, 12);

  await addMovement(t, productId, 11);

  await expect(expectCacheMatchesLedger(t, productId)).rejects.toThrow();
});
