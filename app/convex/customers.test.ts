import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  aCustomer,
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";

test("a mixed cash and utang history, less a payment, is the customer's balance", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t);
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });
  const pancit = await aProductHolding(t, 40, {
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
  });

  // ₱225 on utang
  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [{ productId: coke, quantity: 3 }],
  });
  // Paid in cash — owed nothing, so it must not reach the balance
  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "cash",
    items: [{ productId: coke, quantity: 2 }],
  });
  // ₱75 + ₱60 = ₱135 on utang
  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [
      { productId: coke, quantity: 1 },
      { productId: pancit, quantity: 4 },
    ],
  });
  await t.mutation(api.payments.create, {
    customerId,
    amount: 100,
    paidAt: Date.now(),
  });

  // ₱225 + ₱135 − ₱100
  expect(await t.query(api.customers.get, { id: customerId })).toMatchObject({
    balance: 260,
  });
  expect(await t.query(api.customers.list, {})).toMatchObject([
    { balance: 260 },
  ]);

  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
});

test("a customer with no sales owes nothing", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Mang Tonyo");

  expect(await t.query(api.customers.get, { id: customerId })).toMatchObject({
    balance: 0,
  });
});
