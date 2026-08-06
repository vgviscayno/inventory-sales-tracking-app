import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";

test("a delivery raises each product's count by its line quantity", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
  });

  await t.mutation(api.deliveries.create, {
    lines: [
      { productId: coke, quantity: 12 },
      { productId: pancit, quantity: 5 },
    ],
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 32,
  });
  expect(await t.query(api.products.get, { id: pancit })).toMatchObject({
    quantityOnHand: 15,
  });
  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
});

test("two lines for the same product in one delivery both move stock", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await t.mutation(api.deliveries.create, {
    lines: [
      { productId: coke, quantity: 3 },
      { productId: coke, quantity: 2 },
    ],
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 25,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("a delivery must have at least one line", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.deliveries.create, { lines: [] }),
  ).rejects.toThrow();
});

test("a delivery line cannot carry a zero or negative quantity", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await expect(
    t.mutation(api.deliveries.create, {
      lines: [{ productId: coke, quantity: 0 }],
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.deliveries.create, {
      lines: [{ productId: coke, quantity: -3 }],
    }),
  ).rejects.toThrow();

  await expectCacheMatchesLedger(t, coke);
});

test("deliveries list newest first, each carrying its lines and net change", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20, { name: "Coke 1.5L" });
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
  });

  await t.mutation(api.deliveries.create, {
    lines: [{ productId: coke, quantity: 12 }],
  });
  await t.mutation(api.deliveries.create, {
    lines: [
      { productId: coke, quantity: 4 },
      { productId: pancit, quantity: 5 },
    ],
  });

  const entries = await t.query(api.deliveries.list, {});

  expect(entries).toHaveLength(2);
  // Newest first.
  expect(entries[0].netChange).toBe(9);
  expect(entries[0].lines).toMatchObject([
    { productName: "Coke 1.5L", quantity: 4 },
    { productName: "Lucky Me Pancit Canton", quantity: 5 },
  ]);
  expect(entries[1].netChange).toBe(12);
  expect(entries[1].lines).toMatchObject([
    { productName: "Coke 1.5L", quantity: 12 },
  ]);
});
