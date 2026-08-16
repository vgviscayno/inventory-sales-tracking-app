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

// --- Correcting and removing a product's Units (INV-44) ---

test("correcting a Unit's price leaves past sales at the price they were rung up at", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 60, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "tray", quantity: 2 }],
  });

  // The tray goes up from ₱220 to ₱250 — a price rise, not a migration.
  await t.mutation(api.products.update, {
    id: eggs,
    units: [
      { label: "piece", baseEquivalent: 1, price: 8 },
      { label: "tray", baseEquivalent: 30, price: 250 },
    ],
  });

  expect((await t.query(api.products.get, { id: eggs }))?.units).toContainEqual(
    { label: "tray", baseEquivalent: 30, price: 250 },
  );
  // The sale already rung up holds its ₱440 — priced off the snapshot, not the
  // Unit's live price.
  const [sale] = await t.query(api.sales.list, {});
  expect(sale.totalAmount).toBe(440);
});

test("correcting a Unit's Base equivalent does not resize past movements — the snapshot holds", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 60, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "tray", quantity: 1 }],
  });

  // A tray was first recorded as 30, corrected to 12.
  await t.mutation(api.products.update, {
    id: eggs,
    units: [
      { label: "piece", baseEquivalent: 1, price: 8 },
      { label: "tray", baseEquivalent: 12, price: 220 },
    ],
  });

  const ledger = await t.query(api.stockMovements.listForProduct, {
    productId: eggs,
  });
  // The already-recorded tray sale still reads as -30 pieces, not -12, and the
  // cache is untouched by the correction.
  expect(ledger[0]).toMatchObject({ unitLabel: "tray", netChange: -30 });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 30,
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("a Unit can be added to a product that already has history", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 60, {
    name: "Eggs",
    units: [{ label: "piece", baseEquivalent: 1, price: 8 }],
    baseUnitLabel: "piece",
  });
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "piece", quantity: 5 }],
  });

  // She starts selling eggs by the tray without needing a new product.
  await t.mutation(api.products.update, {
    id: eggs,
    units: EGGS_UNITS,
  });

  expect((await t.query(api.products.get, { id: eggs }))?.units).toHaveLength(
    2,
  );
  // And the new Unit is immediately usable.
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "tray", quantity: 1 }],
  });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 25, // 60 - 5 - 30
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("a non-Base Unit can be removed, and movements recorded under it still read back under its original label", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 100, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "tray", quantity: 1 }],
  });

  await t.mutation(api.products.update, {
    id: eggs,
    units: [{ label: "piece", baseEquivalent: 1, price: 8 }],
  });

  expect((await t.query(api.products.get, { id: eggs }))?.units).toHaveLength(
    1,
  );
  const ledger = await t.query(api.stockMovements.listForProduct, {
    productId: eggs,
  });
  // The tray sale keeps reading as a tray, off its snapshot, though the Unit is
  // gone from the product.
  expect(ledger[0]).toMatchObject({ unitLabel: "tray", netChange: -30 });
  await expectCacheMatchesLedger(t, eggs);
});

test("removing the Unit that was the Default leaves the product leading with its Base unit", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.products.update, { id: eggs, defaultUnitLabel: "tray" });

  await t.mutation(api.products.update, {
    id: eggs,
    units: [{ label: "piece", baseEquivalent: 1, price: 8 }],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    defaultUnit: { label: "piece" },
  });
});

test("removing the Base unit is refused", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await expect(
    t.mutation(api.products.update, {
      id: eggs,
      units: [{ label: "tray", baseEquivalent: 30, price: 220 }],
    }),
  ).rejects.toThrow();

  expect((await t.query(api.products.get, { id: eggs }))?.units).toHaveLength(
    2,
  );
});

test("reassigning the Base unit succeeds while the product has no movements", async () => {
  const t = setupTest();
  // Created based in kilos, no stock logged yet — the wrong-Base-unit fix is
  // free until the first movement.
  const rice = await aProductHolding(t, 0, {
    name: "Rice",
    units: [{ label: "kg", baseEquivalent: 1, price: 75 }],
    baseUnitLabel: "kg",
  });

  await t.mutation(api.products.update, {
    id: rice,
    units: [
      { label: "g", baseEquivalent: 1, price: 0.075 },
      { label: "kg", baseEquivalent: 1000, price: 75 },
    ],
    baseUnitLabel: "g",
  });

  expect(await t.query(api.products.get, { id: rice })).toMatchObject({
    baseUnitLabel: "g",
  });
});

test("reassigning the Base unit is refused once the product has movements, with a message pointing at archiving and recreating", async () => {
  const t = setupTest();
  // A delivery has been logged, so a movement exists.
  const rice = await aProductHolding(t, 50, {
    name: "Rice",
    units: [{ label: "kg", baseEquivalent: 1, price: 75 }],
    baseUnitLabel: "kg",
  });

  await expect(
    t.mutation(api.products.update, {
      id: rice,
      units: [
        { label: "g", baseEquivalent: 1, price: 0.075 },
        { label: "kg", baseEquivalent: 1000, price: 75 },
      ],
      baseUnitLabel: "g",
    }),
  ).rejects.toThrow(/locked[\s\S]*archive|archive[\s\S]*recreat/i);

  // Nothing changed — the Base unit is still what it was.
  expect(await t.query(api.products.get, { id: rice })).toMatchObject({
    baseUnitLabel: "kg",
  });
});

test("a Unit's price and Base equivalent can be corrected in the same update as the Default unit changes", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await t.mutation(api.products.update, {
    id: eggs,
    units: [
      { label: "piece", baseEquivalent: 1, price: 9 },
      { label: "tray", baseEquivalent: 30, price: 250 },
    ],
    defaultUnitLabel: "tray",
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    defaultUnit: { label: "tray", price: 250 },
  });
});
