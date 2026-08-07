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

test("a sale that would drive stock negative is refused without the flag", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 2, { sellingPrice: 75 });

  await expect(
    t.mutation(api.sales.create, {
      paymentMethod: "cash",
      items: [{ productId: coke, quantity: 3 }],
    }),
  ).rejects.toThrow(/Coke 1\.5L/);

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 2,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("the same product across two lines is refused on their sum, not per line", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 4);

  await expect(
    t.mutation(api.sales.create, {
      paymentMethod: "cash",
      items: [
        { productId: coke, quantity: 3 },
        { productId: coke, quantity: 3 },
      ],
    }),
  ).rejects.toThrow();

  await expectCacheMatchesLedger(t, coke);
});

test("allowNegative records the sale and lands the negative count", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t);
  const coke = await aProductHolding(t, 2, { sellingPrice: 75 });

  // One flag for the whole call — one confirm gesture, one save.
  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [{ productId: coke, quantity: 5 }],
    allowNegative: true,
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: -3,
  });
  expect(
    await t.query(api.sales.listForCustomer, { customerId }),
  ).toMatchObject([{ totalAmount: 375 }]);
  await expectCacheMatchesLedger(t, coke);
});

test("a sale off an already-negative count is still refused without the flag", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 1);

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: coke, quantity: 4 }],
    allowNegative: true,
  });

  await expect(
    t.mutation(api.sales.create, {
      paymentMethod: "cash",
      items: [{ productId: coke, quantity: 1 }],
    }),
  ).rejects.toThrow();

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: -3,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("sales list newest first, each carrying its lines, net change, and customer name", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Aling Nena");
  const coke = await aProductHolding(t, 20, { name: "Coke 1.5L" });
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
  });

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: coke, quantity: 3 }],
  });
  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [
      { productId: coke, quantity: 2 },
      { productId: pancit, quantity: 1 },
    ],
  });

  const entries = await t.query(api.sales.list, {});

  expect(entries).toHaveLength(2);
  // Newest first.
  expect(entries[0].netChange).toBe(-3);
  expect(entries[0].customerName).toBe("Aling Nena");
  expect(entries[0].lines).toMatchObject([
    { productName: "Coke 1.5L", quantity: -2 },
    { productName: "Lucky Me Pancit Canton", quantity: -1 },
  ]);
  expect(entries[1].netChange).toBe(-3);
  expect(entries[1].customerName).toBeUndefined();
  expect(entries[1].lines).toMatchObject([
    { productName: "Coke 1.5L", quantity: -3 },
  ]);
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
