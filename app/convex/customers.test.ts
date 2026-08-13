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

test("updating a customer edits their name and notes", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Aling Nena");

  await t.mutation(api.customers.update, {
    id: customerId,
    name: "Nena Santos",
    notes: "Prefers cash on Fridays",
  });

  expect(await t.query(api.customers.get, { id: customerId })).toMatchObject({
    name: "Nena Santos",
    notes: "Prefers cash on Fridays",
  });
});

test("updating a customer's notes to empty clears them, not just leaves them untouched", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Aling Nena");
  await t.mutation(api.customers.update, {
    id: customerId,
    notes: "Prefers cash on Fridays",
  });

  await t.mutation(api.customers.update, { id: customerId, notes: null });

  expect((await t.query(api.customers.get, { id: customerId }))?.notes).toBe(
    undefined,
  );
});

test("archiving a customer removes them from the default list but leaves get and withArchived able to find them", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Seasonal Buyer");

  await t.mutation(api.customers.archive, { id: customerId });

  expect(await t.query(api.customers.list, {})).toEqual([]);
  expect(
    await t.query(api.customers.list, { include: "withArchived" }),
  ).toMatchObject([{ _id: customerId, name: "Seasonal Buyer" }]);
  expect(await t.query(api.customers.get, { id: customerId })).toMatchObject({
    name: "Seasonal Buyer",
    archivedAt: expect.any(Number),
  });
});

test("archiving a customer who owes money is never blocked", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Nita");
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });
  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [{ productId: coke, quantity: 3 }],
  });

  await expect(
    t.mutation(api.customers.archive, { id: customerId }),
  ).resolves.not.toThrow();

  expect(await t.query(api.customers.get, { id: customerId })).toMatchObject({
    balance: 225,
    archivedAt: expect.any(Number),
  });
});

test("unarchiving a customer brings them back into the default list and clears archivedAt", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t);
  await t.mutation(api.customers.archive, { id: customerId });

  await t.mutation(api.customers.unarchive, { id: customerId });

  expect(
    (await t.query(api.customers.get, { id: customerId }))?.archivedAt,
  ).toBe(undefined);
  expect(await t.query(api.customers.list, {})).toMatchObject([
    { _id: customerId },
  ]);
});

test("deleting an archived, settled customer soft-deletes them and hides them from every list, but leaves get able to find them", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Typo Customer");
  await t.mutation(api.customers.archive, { id: customerId });

  await t.mutation(api.customers.remove, { id: customerId });

  expect(await t.query(api.customers.list, {})).toEqual([]);
  expect(
    await t.query(api.customers.list, { include: "withArchived" }),
  ).toEqual([]);
  expect(await t.query(api.customers.get, { id: customerId })).toMatchObject({
    name: "Typo Customer",
    deletedAt: expect.any(Number),
  });
});

test("deleting a customer that isn't archived is refused, even when settled", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t);

  await expect(
    t.mutation(api.customers.remove, { id: customerId }),
  ).rejects.toThrow();

  expect(
    (await t.query(api.customers.get, { id: customerId }))?.deletedAt,
  ).toBe(undefined);
});

test("deleting an archived customer who owes money is refused, naming the amount", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Nita");
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });
  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [{ productId: coke, quantity: 3 }],
  });
  await t.mutation(api.customers.archive, { id: customerId });

  await expect(
    t.mutation(api.customers.remove, { id: customerId }),
  ).rejects.toThrow("Nita owes ₱225.00 — settle first");

  expect(
    (await t.query(api.customers.get, { id: customerId }))?.deletedAt,
  ).toBe(undefined);
});

// An overpayment is still money — it blocks deletion exactly like a debt
// does, not just a positive balance.
test("deleting an archived customer who is owed money (an overpayment) is refused", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Nita");
  await t.mutation(api.payments.create, {
    customerId,
    amount: 50,
    paidAt: Date.now(),
  });
  await t.mutation(api.customers.archive, { id: customerId });

  await expect(
    t.mutation(api.customers.remove, { id: customerId }),
  ).rejects.toThrow("Nita is owed ₱50.00 — settle first");

  expect(
    (await t.query(api.customers.get, { id: customerId }))?.deletedAt,
  ).toBe(undefined);
});

// History alone never traps a row on her list forever — only the balance
// does.
test("a settled customer with a long sale and payment history deletes successfully", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Longtime Regular");
  const coke = await aProductHolding(t, 100, { sellingPrice: 75 });

  for (let i = 0; i < 5; i++) {
    await t.mutation(api.sales.create, {
      customerId,
      paymentMethod: "utang",
      items: [{ productId: coke, quantity: 1 }],
    });
    await t.mutation(api.payments.create, {
      customerId,
      amount: 75,
      paidAt: Date.now(),
    });
  }
  await t.mutation(api.customers.archive, { id: customerId });

  await expect(
    t.mutation(api.customers.remove, { id: customerId }),
  ).resolves.not.toThrow();

  expect(await t.query(api.customers.get, { id: customerId })).toMatchObject({
    name: "Longtime Regular",
    deletedAt: expect.any(Number),
  });
});

test("a deleted customer's name still renders on their past sales and payments", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t, "Ghost Customer");
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });
  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [{ productId: coke, quantity: 1 }],
  });
  await t.mutation(api.payments.create, {
    customerId,
    amount: 75,
    paidAt: Date.now(),
  });
  await t.mutation(api.customers.archive, { id: customerId });
  await t.mutation(api.customers.remove, { id: customerId });

  const [sale] = await t.query(api.sales.list, {});
  expect(sale.customerName).toBe("Ghost Customer");
});
