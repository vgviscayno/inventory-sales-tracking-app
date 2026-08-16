import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";

test("a product created through the mutation reads back through the query", async () => {
  const t = setupTest();

  const id = await aProductHolding(t, 24, {
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    name: "Lucky Me Pancit Canton",
    units: [{ label: "pc", baseEquivalent: 1, price: 15 }],
    quantityOnHand: 24,
    lowStockStatus: "ok",
  });
});

test("creating a product without a quantity starts it at zero", async () => {
  const t = setupTest();

  const id = await t.mutation(api.products.create, {
    name: "New Product",
    units: [{ label: "pc", baseEquivalent: 1, price: 20 }],
    baseUnitLabel: "pc",
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
    items: [{ productId: id, unitLabel: "pc", quantity: 5 }],
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

test("archiving a product removes it from the default list but leaves get and withArchived able to find it", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 12, { name: "Seasonal Umbrella" });

  await t.mutation(api.products.archive, { id });

  expect(await t.query(api.products.list, {})).toEqual([]);
  expect(
    await t.query(api.products.list, { include: "withArchived" }),
  ).toMatchObject([{ _id: id, name: "Seasonal Umbrella" }]);
  expect(await t.query(api.products.get, { id })).toMatchObject({
    name: "Seasonal Umbrella",
    archivedAt: expect.any(Number),
  });
});

test("archiving a product with stock is never blocked, and touches neither the cache nor the ledger", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 12);

  await expect(t.mutation(api.products.archive, { id })).resolves.not.toThrow();

  expect(await t.query(api.products.get, { id })).toMatchObject({
    quantityOnHand: 12,
  });
  await expectCacheMatchesLedger(t, id);
});

test("an archived product carries no low-stock status, even when its count is under threshold", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 2);

  await t.mutation(api.products.archive, { id });

  expect((await t.query(api.products.get, { id }))?.lowStockStatus).toBe(
    undefined,
  );
});

test("unarchiving a product brings it back into the default list and clears archivedAt", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 12);
  await t.mutation(api.products.archive, { id });

  await t.mutation(api.products.unarchive, { id });

  expect((await t.query(api.products.get, { id }))?.archivedAt).toBe(undefined);
  expect(await t.query(api.products.list, {})).toMatchObject([{ _id: id }]);
});

test("deleting an archived, empty product soft-deletes it and hides it from every list, but leaves get and the ledger able to find it", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 0, { name: "Typo Product" });
  await t.mutation(api.products.archive, { id });

  await t.mutation(api.products.remove, { id });

  expect(await t.query(api.products.list, {})).toEqual([]);
  expect(await t.query(api.products.list, { include: "withArchived" })).toEqual(
    [],
  );
  expect(await t.query(api.products.get, { id })).toMatchObject({
    name: "Typo Product",
    deletedAt: expect.any(Number),
  });
});

test("deleting a product that isn't archived is refused, even with nothing on hand", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 0);

  await expect(t.mutation(api.products.remove, { id })).rejects.toThrow();

  expect((await t.query(api.products.get, { id }))?.deletedAt).toBe(undefined);
});

test("deleting an archived product still holding stock is refused, regardless of what the UI showed", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 7);
  await t.mutation(api.products.archive, { id });

  await expect(t.mutation(api.products.remove, { id })).rejects.toThrow();

  expect((await t.query(api.products.get, { id }))?.deletedAt).toBe(undefined);
});

// A deleted-while-negative product would be an unreconcilable cache row with
// no UI left to repair it — the gate treats negative the same as any other
// non-zero count, not as an exception.
test("deleting an archived product with a negative count is refused", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 2);
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: id, unitLabel: "pc", quantity: 5 }],
    allowNegative: true,
  });
  await t.mutation(api.products.archive, { id });

  await expect(t.mutation(api.products.remove, { id })).rejects.toThrow();

  expect((await t.query(api.products.get, { id }))?.deletedAt).toBe(undefined);
});

test("deleting a product touches neither its cached count nor the ledger, and its name still renders on the sale that named it", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 3, { name: "Ghost SKU" });
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: id, unitLabel: "pc", quantity: 3 }],
  });
  await t.mutation(api.products.archive, { id });

  await t.mutation(api.products.remove, { id });

  await expectCacheMatchesLedger(t, id);
  const [sale] = await t.query(api.sales.list, {});
  expect(sale.lines).toMatchObject([{ productName: "Ghost SKU" }]);
});

// The rough edge the ticket calls out: a typo product born from "+ Add as new
// product" arrives with stock, because the delivery line that created it put
// units on it. Cleanup composes — drop the line, the ghost falls to 0,
// archive, delete.
test("the ghost-product cleanup path: a mis-typed inline delivery product is dropped from its entry, falls to 0, archives, and deletes", async () => {
  const t = setupTest();
  const realId = await aProductHolding(t, 0, { name: "Coke 1.5L" });

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: realId, quantity: 10 },
      {
        kind: "new",
        name: "Cok 1.5L (typo)",
        unitLabel: "pc",
        price: 75,
        quantity: 5,
      },
    ],
  });

  const { lines } = await t.query(api.stockMovements.getEntry, {
    entry: { type: "delivery", entryId: deliveryId },
  });
  const ghostLine = lines.find((l) => l.productName === "Cok 1.5L (typo)");
  const realLine = lines.find((l) => l.productId === realId);
  if (!ghostLine || !realLine) throw new Error("Expected line not found");
  const ghostId = ghostLine.productId;

  // Reopen the entry and drop the ghost's line, re-pointing nothing since the
  // real product's own line already covers the delivered stock.
  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [
      { movementId: realLine.movementId, productId: realId, quantity: 10 },
    ],
  });

  expect(await t.query(api.products.get, { id: ghostId })).toMatchObject({
    quantityOnHand: 0,
  });

  await t.mutation(api.products.archive, { id: ghostId });
  await t.mutation(api.products.remove, { id: ghostId });

  expect(await t.query(api.products.get, { id: ghostId })).toMatchObject({
    deletedAt: expect.any(Number),
  });
  expect(
    await t.query(api.products.list, { include: "withArchived" }),
  ).toMatchObject([{ _id: realId, name: "Coke 1.5L" }]);
});

const EGGS_UNITS = [
  { label: "piece", baseEquivalent: 1, price: 8 },
  { label: "tray", baseEquivalent: 30, price: 220 },
];

test("a product created with a Default unit reads it back from get and list", async () => {
  const t = setupTest();

  const id = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    defaultUnit: { label: "tray", price: 220 },
  });
  expect(await t.query(api.products.list, {})).toMatchObject([
    { defaultUnit: { label: "tray", price: 220 } },
  ]);
});

test("a product created with no Default unit reads back the Base unit as its Default everywhere", async () => {
  const t = setupTest();

  const id = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    defaultUnit: { label: "piece", price: 8 },
  });
  expect(await t.query(api.products.list, {})).toMatchObject([
    { defaultUnit: { label: "piece", price: 8 } },
  ]);
});

test("products.create refuses a Default unit label not among the Units", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.products.create, {
      name: "Eggs",
      units: EGGS_UNITS,
      baseUnitLabel: "piece",
      defaultUnitLabel: "sack",
    }),
  ).rejects.toThrow();
});

test("updating a product's Default unit changes what get and list read", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await t.mutation(api.products.update, { id, defaultUnitLabel: "tray" });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    defaultUnit: { label: "tray" },
  });
});

test("clearing a product's Default unit with null falls back to the Base unit again", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.products.update, { id, defaultUnitLabel: "tray" });

  await t.mutation(api.products.update, { id, defaultUnitLabel: null });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    defaultUnit: { label: "piece" },
  });
});

test("updating a product refuses a Default unit label not among its Units", async () => {
  const t = setupTest();
  const id = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await expect(
    t.mutation(api.products.update, { id, defaultUnitLabel: "sack" }),
  ).rejects.toThrow();

  expect(await t.query(api.products.get, { id })).toMatchObject({
    defaultUnit: { label: "piece" },
  });
});
