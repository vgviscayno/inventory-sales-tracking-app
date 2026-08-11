import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import {
  aCustomer,
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";

test("the opening row is the oldest row, and the newest row's running balance equals quantityOnHand", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
  });
  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 3 }],
    reasonCategory: "damaged",
  });

  const rows = await t.query(api.stockMovements.listForProduct, {
    productId: coke,
  });

  expect(rows).toHaveLength(3);
  // Newest first.
  expect(rows[0].type).toBe("pullout");
  expect(rows[1].type).toBe("delivery");
  expect(rows[2].type).toBe("opening");

  const product = await t.query(api.products.get, { id: coke });
  expect(rows[0].runningBalance).toBe(product?.quantityOnHand);
  await expectCacheMatchesLedger(t, coke);
});

test("a sale row carries its line total, not the signed delta", async () => {
  const t = setupTest();
  const customerId = await aCustomer(t);
  const coke = await aProductHolding(t, 20, { sellingPrice: 75 });

  await t.mutation(api.sales.create, {
    customerId,
    paymentMethod: "utang",
    items: [{ productId: coke, quantity: 3 }],
  });

  const rows = await t.query(api.stockMovements.listForProduct, {
    productId: coke,
  });

  expect(rows[0]).toMatchObject({
    type: "sale",
    netChange: -3,
    lineTotal: 225,
  });
});

test("a pull-out row carries its reason category and note", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 2 }],
    reasonCategory: "other",
    reasonNotes: "box fell off the tricycle",
  });

  const rows = await t.query(api.stockMovements.listForProduct, {
    productId: coke,
  });

  expect(rows[0]).toMatchObject({
    type: "pullout",
    reasonCategory: "other",
    reasonNotes: "box fell off the tricycle",
  });
});

test("running balance accumulates oldest to newest, in a mixed sequence", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 10);

  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
  });
  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 8 }],
    reasonCategory: "expired",
  });
  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 3 }],
  });

  const rows = await t.query(api.stockMovements.listForProduct, {
    productId: coke,
  });

  // Newest first: +3 delivery (10), -8 pullout (7), +5 delivery (15), opening (10).
  expect(rows.map((r) => r.runningBalance)).toEqual([10, 7, 15, 10]);
});

test("a backfilled opening row still sorts as the oldest, even when the backfill runs after other movements", async () => {
  const t = setupTest();

  // A product created directly with a count and sold from before the backfill
  // ever ran — its opening row is written after the sale's `createdAt`, but
  // has to read as the oldest row regardless.
  const coke = await t.mutation(api.products.create, {
    name: "Coke 1.5L",
    sellingPrice: 75,
    quantityOnHand: 20,
  });
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: coke, quantity: 3 }],
  });
  await t.mutation(internal.backfills.openingBalances, {});

  const rows = await t.query(api.stockMovements.listForProduct, {
    productId: coke,
  });

  expect(rows).toHaveLength(2);
  expect(rows[0].type).toBe("sale");
  expect(rows[1].type).toBe("opening");
  await expectCacheMatchesLedger(t, coke);
});
