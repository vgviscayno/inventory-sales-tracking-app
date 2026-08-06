import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { aProductHolding, setupTest } from "./test.helpers";

test("a product created through the mutation reads back through the query", async () => {
  const t = setupTest();

  const id = await aProductHolding(t, 24, {
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
    quantityOnHand: 24,
    lowStockStatus: "ok",
  });
});

test("creating a product without a quantity starts it at zero", async () => {
  const t = setupTest();

  const id = await t.mutation(api.products.create, {
    name: "New Product",
    sellingPrice: 20,
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    quantityOnHand: 0,
  });
});

test("updating a product cannot set its quantity on hand directly", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 20);

  await expect(
    t.mutation(api.products.update, {
      id,
      // @ts-expect-error quantityOnHand is not part of this mutation's args
      quantityOnHand: 5,
    }),
  ).rejects.toThrow();

  expect(await t.query(api.products.get, { id })).toMatchObject({
    quantityOnHand: 20,
  });
});

test("a count at or under the threshold reads as low", async () => {
  const t = setupTest();

  const id = await aProductHolding(t, 10);

  expect(await t.query(api.products.get, { id })).toMatchObject({
    lowStockStatus: "low",
  });
});

// A negative count is also `<= threshold`, so the two cases overlap and the
// order they are checked in decides which one a shopkeeper sees. "Recount this"
// must never render as "order more".
test("a negative count reads as negative, not merely low", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 2);

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: id, quantity: 5 }],
    allowNegative: true,
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    quantityOnHand: -3,
    lowStockStatus: "negative",
  });
  expect(await t.query(api.products.list, {})).toMatchObject([
    { lowStockStatus: "negative" },
  ]);
});
