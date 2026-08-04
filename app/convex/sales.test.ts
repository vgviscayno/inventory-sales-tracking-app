import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  aCustomer,
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";

test("a sale moves its products' stock through the ledger", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
  });

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [
      { productId: coke, quantity: 3 },
      { productId: pancit, quantity: 2 },
    ],
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 17,
  });
  expect(await t.query(api.products.get, { id: pancit })).toMatchObject({
    quantityOnHand: 8,
  });
  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
});

test("a sale's total is the positive amount charged, not the negative delta", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t);
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
  });

  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [
      { productId: coke, quantity: 3 },
      { productId: pancit, quantity: 2 },
    ],
  });

  // 3 × ₱75 + 2 × ₱15
  expect(
    await t.query(api.sales.listForCustomer, { customerId }),
  ).toMatchObject([{ totalAmount: 255 }]);
});

test("the same product on two lines of one sale moves stock twice", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t);
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });

  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [
      { productId: coke, quantity: 3 },
      { productId: coke, quantity: 2 },
    ],
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 15,
  });
  expect(
    await t.query(api.sales.listForCustomer, { customerId }),
  ).toMatchObject([{ totalAmount: 375 }]);
  await expectCacheMatchesLedger(t, coke);
});

test("a sale line cannot carry a negative quantity", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await expect(
    t.mutation(api.sales.create, {
      paymentMethod: "cash",
      items: [{ productId: coke, quantity: -3 }],
    }),
  ).rejects.toThrow();

  await expectCacheMatchesLedger(t, coke);
});

test("a sale charges the price at the time, not the price today", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t);
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });

  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [{ productId: coke, quantity: 2 }],
  });
  await t.mutation(api.products.update, { id: coke, sellingPrice: 90 });

  expect(
    await t.query(api.sales.listForCustomer, { customerId }),
  ).toMatchObject([{ totalAmount: 150 }]);
});
