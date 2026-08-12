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

test("editEntry moves a delivery product's count by exactly the difference, in either direction", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 10 }],
  });
  const [line] = (await t.query(api.deliveries.list, {}))[0].lines;

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 7 }],
  });
  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 27, // 20 + 7, not 20 + 10
  });
  await expectCacheMatchesLedger(t, coke);

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 12 }],
  });
  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 32, // 27 - 7 + 12
  });
  await expectCacheMatchesLedger(t, coke);
});

test("editEntry moves a pull-out product's count by exactly the difference, in either direction", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 5 }],
    reasonCategory: "damaged",
  });
  const [line] = (await t.query(api.pullouts.list, {}))[0].lines;

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "pullout", entryId: pulloutId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 2 }],
    reasonCategory: "damaged",
  });
  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 18, // 20 - 2, not 20 - 5
  });
  await expectCacheMatchesLedger(t, coke);
});

test("editEntry adds a new line and patches the product", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
  });

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
  });
  const [line] = (await t.query(api.deliveries.list, {}))[0].lines;

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [
      { movementId: line.movementId, productId: coke, quantity: 5 },
      { productId: pancit, quantity: 4 },
    ],
  });

  expect(await t.query(api.products.get, { id: pancit })).toMatchObject({
    quantityOnHand: 14,
  });
  const entry = (await t.query(api.deliveries.list, {})).find(
    (e) => e._id === deliveryId,
  );
  expect(entry?.lines).toHaveLength(2);
  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
});

test("editEntry drops a line, deleting its movement and reversing its delta", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
  });

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: coke, quantity: 5 },
      { kind: "existing", productId: pancit, quantity: 4 },
    ],
  });
  const lines = (await t.query(api.deliveries.list, {})).find(
    (e) => e._id === deliveryId,
  )?.lines;
  const cokeLine = lines?.find((l) => l.productId === coke);
  if (!cokeLine) throw new Error("Missing coke line");

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ movementId: cokeLine.movementId, productId: coke, quantity: 5 }],
  });

  expect(await t.query(api.products.get, { id: pancit })).toMatchObject({
    quantityOnHand: 10, // the dropped +4 reversed
  });
  const entry = (await t.query(api.deliveries.list, {})).find(
    (e) => e._id === deliveryId,
  );
  expect(entry?.lines).toHaveLength(1);
  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
});

test("editEntry judges a product touched by two lines on its net delta, not line by line", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 2, { name: "Coke 1.5L" });

  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 1 }],
    reasonCategory: "damaged",
  });
  const [line] = (await t.query(api.pullouts.list, {}))[0].lines;

  // Raising the existing line to 2 and adding a second line of 1 more takes
  // coke to 2 - 3 = -1 net — below zero even though neither line alone would
  // read that way against the stale count each was typed against.
  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "pullout", entryId: pulloutId },
      lines: [
        { movementId: line.movementId, productId: coke, quantity: 2 },
        { productId: coke, quantity: 1 },
      ],
      reasonCategory: "damaged",
    }),
  ).rejects.toThrow(/Coke 1\.5L/);

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "pullout", entryId: pulloutId },
    lines: [
      { movementId: line.movementId, productId: coke, quantity: 2 },
      { productId: coke, quantity: 1 },
    ],
    reasonCategory: "damaged",
    allowNegative: true,
  });
  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: -1,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("editEntry rejects a sale entry — those are edited from the Register", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  const saleId = await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: coke, quantity: 3 }],
  });
  const [line] = (await t.query(api.sales.list, {}))[0].lines;

  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "sale", entryId: saleId },
      lines: [{ movementId: line.movementId, productId: coke, quantity: 1 }],
    }),
  ).rejects.toThrow(/Register/);
  await expectCacheMatchesLedger(t, coke);
});

test("editEntry drives a delivery's product negative when a line is lowered, and is refused without allowNegative", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 5, { name: "Coke 1.5L" });

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 10 }],
  });
  const [line] = (await t.query(api.deliveries.list, {}))[0].lines;
  // 5 on hand came from the +10 delivery plus a -5 pull-out that happened
  // since — lowering the delivery line to 2 would take coke to -3.
  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 10 }],
    reasonCategory: "damaged",
    allowNegative: true,
  });

  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "delivery", entryId: deliveryId },
      lines: [{ movementId: line.movementId, productId: coke, quantity: 2 }],
    }),
  ).rejects.toThrow(/Coke 1\.5L/);

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 2 }],
    allowNegative: true,
  });
  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: -3,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("editEntry updates a pull-out's reason across every one of its lines", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 3 }],
    reasonCategory: "damaged",
  });
  const [line] = (await t.query(api.pullouts.list, {}))[0].lines;

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "pullout", entryId: pulloutId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 3 }],
    reasonCategory: "other",
    reasonNotes: "box fell off the tricycle",
  });

  const entry = (await t.query(api.pullouts.list, {})).find(
    (e) => e._id === pulloutId,
  );
  expect(entry).toMatchObject({
    reasonCategory: "other",
    reasonNotes: "box fell off the tricycle",
  });
});

test("editEntry requires at least one line", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
  });

  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "delivery", entryId: deliveryId },
      lines: [],
    }),
  ).rejects.toThrow();
  await expectCacheMatchesLedger(t, coke);
});

test("editEntry rejects an entry with no existing rows, rather than silently inserting orphan movements", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  // A header row with no movements pointing at it yet — not something the
  // create mutations ever produce, but exactly the shape a bogus `entryId`
  // paired with an all-new line set would otherwise sail through as.
  const orphanDeliveryId = await t.run(
    async (ctx) => await ctx.db.insert("deliveries", { createdAt: Date.now() }),
  );

  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "delivery", entryId: orphanDeliveryId },
      lines: [{ productId: coke, quantity: 3 }],
    }),
  ).rejects.toThrow(/does not exist/);
  await expectCacheMatchesLedger(t, coke);
});

test("the cache tracks the ledger through an edit that both adds and drops lines in the same save", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20, { name: "Coke 1.5L" });
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
  });
  const noodles = await aProductHolding(t, 0, { name: "Nissin Cup Noodles" });

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: coke, quantity: 5 },
      { kind: "existing", productId: pancit, quantity: 4 },
    ],
  });
  const before = (await t.query(api.deliveries.list, {})).find(
    (e) => e._id === deliveryId,
  )?.lines;
  const cokeLine = before?.find((l) => l.productId === coke);
  if (!cokeLine) throw new Error("Missing coke line");

  // Keep the coke line at a changed quantity, drop the pancit line, and add a
  // brand-new noodles line — a delete, a patch, and an insert in one save.
  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [
      { movementId: cokeLine.movementId, productId: coke, quantity: 9 },
      { productId: noodles, quantity: 6 },
    ],
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 29, // 20 + 9 (not the original +5)
  });
  expect(await t.query(api.products.get, { id: pancit })).toMatchObject({
    quantityOnHand: 10, // the dropped +4 reversed
  });
  expect(await t.query(api.products.get, { id: noodles })).toMatchObject({
    quantityOnHand: 6,
  });
  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
  await expectCacheMatchesLedger(t, noodles);
});
