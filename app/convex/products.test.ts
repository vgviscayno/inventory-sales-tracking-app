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

// A negative count is also `<= threshold`, so the two cases overlap. The order
// the code checks them in decides which one a shopkeeper sees. "Recount this"
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

// A product deleted while negative leaves a cache row nobody can reconcile,
// and no screen to repair it. The gate therefore treats a negative count the
// same as any other non-zero count, and not as an exception.
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

// The rough edge the ticket calls out. A typo product born from "+ Add as new
// product" arrives with stock. The Delivery Line that created it put Units on
// it.
// The cleanup composes. Drop the Line, and the ghost falls to 0. Then archive
// it, then delete it.
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

  // Reopen the Entry and drop the ghost's Line. Nothing re-points, because the
  // real product's own Line already covers the delivered stock.
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

  // The tray goes up from ₱220 to ₱250. That is a price rise, and not a
  // migration.
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
  // The earlier Sale holds its ₱440. It prices off the snapshot, and not off
  // the Unit's live price.
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
  // The earlier tray Sale still reads as -30 pieces, and not as -12. The
  // correction leaves the cache untouched.
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

  // The shop starts selling eggs by the tray, and needs no new product.
  await t.mutation(api.products.update, {
    id: eggs,
    units: EGGS_UNITS,
  });

  expect((await t.query(api.products.get, { id: eggs }))?.units).toHaveLength(
    2,
  );
  // The new Unit is usable at once.
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
  // The tray Sale keeps reading as a tray, off its snapshot. The Unit is gone
  // from the product.
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
  // The test creates the product based in kilos, and logs no stock yet. The fix
  // for a wrong Base unit is free until the first Movement.
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
  // The test logs a Delivery, so a Movement exists.
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

  // Nothing changed. The Base unit is still what it was.
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

test("the Reading ladder round-trips, and an unticked box clears it", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await t.mutation(api.products.update, {
    id: eggs,
    denominationLabels: ["tray"],
  });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    denominationLabels: ["tray"],
  });

  // An empty array is the clear, because it already means the plain reading.
  // The ladder therefore needs no separate `null`, the way the threshold and
  // the Default unit do.
  await t.mutation(api.products.update, { id: eggs, denominationLabels: [] });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    denominationLabels: [],
  });
});

test("a ladder set on a product reaches the delete gate's message", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 305, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.products.update, {
    id: eggs,
    denominationLabels: ["tray"],
  });
  await t.mutation(api.products.archive, { id: eggs });

  // The gate speaks the same Denomination every other surface does. It does not
  // speak the raw Base-unit figure of 305 pieces.
  await expect(t.mutation(api.products.remove, { id: eggs })).rejects.toThrow(
    "10 trays, 5 pieces still on hand",
  );
});

test("a ladder naming a Unit that has since been removed degrades to the plain reading", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 305, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.products.update, {
    id: eggs,
    denominationLabels: ["tray"],
  });
  // The tray goes, and the stored ladder still names it. The reading must not
  // be what breaks the screen. See `buildReadingLadder`.
  await t.mutation(api.products.update, {
    id: eggs,
    units: [{ label: "piece", baseEquivalent: 1, price: 8 }],
  });
  await t.mutation(api.products.archive, { id: eggs });

  await expect(t.mutation(api.products.remove, { id: eggs })).rejects.toThrow(
    "305 pieces still on hand",
  );
});

test("a product can be created with a Reading ladder already set", async () => {
  const t = setupTest();
  const id = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    denominationLabels: ["tray"],
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    denominationLabels: ["tray"],
  });
});

// The tests below cover the Low-stock threshold. A shopkeeper enters and reads
// it in the Default unit. The row holds it in Base units. The split stops a
// later Default unit change from reinterpreting a stored number. See
// "Low-stock threshold" in CONTEXT.md.

test("a per-product threshold is entered in the Default unit and stored in Base units", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
    // "Warn me under 5 trays", which is 150 pieces.
    lowStockThresholdInDefaultUnits: 5,
  });
  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 4 },
    ],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 120,
    lowStockThreshold: 150,
    lowStockThresholdInDefaultUnits: 5,
    lowStockStatus: "low",
  });
});

test("a threshold set through update is entered in the Default unit too", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
  });
  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 6 },
    ],
  });

  await t.mutation(api.products.update, {
    id: eggs,
    lowStockThresholdInDefaultUnits: 5,
  });

  // Six trays is over five, so the warning stays off.
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 180,
    lowStockThreshold: 150,
    lowStockStatus: "ok",
  });
});

test("changing the Default unit afterwards leaves the stored threshold worth the same stock", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
    lowStockThresholdInDefaultUnits: 5,
  });
  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 4 },
    ],
  });

  await t.mutation(api.products.update, {
    id: eggs,
    defaultUnitLabel: "piece",
  });

  // The threshold is still 150 pieces. It did not become five pieces, which
  // would have turned the warning off over 120 on the shelf.
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    lowStockThreshold: 150,
    lowStockThresholdInDefaultUnits: 150,
    lowStockStatus: "low",
  });
});

test("the shop-wide threshold counts in each product's own Default unit", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
  });
  // Ten trays, which is exactly the shop-wide 10 read in this product's
  // Default unit. Ten pieces would never fire the warning on a product this
  // size.
  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 10 },
    ],
  });
  const coke = await aProductHolding(t, 10);

  const withoutOverride = await t.query(api.products.get, { id: eggs });
  expect(withoutOverride).toMatchObject({
    quantityOnHand: 300,
    lowStockStatus: "low",
  });
  expect(withoutOverride?.lowStockThresholdInDefaultUnits).toBe(undefined);
  // The same shop-wide 10 against a product whose Default unit is its Base
  // unit. One number, two dimensionally sound readings.
  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    lowStockStatus: "low",
  });
});

test("a count over the shop-wide threshold read in trays is not low", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
  });
  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 11 },
    ],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 330,
    lowStockStatus: "ok",
  });
});

// A negative count is also `<= threshold`, and a threshold denominated in
// trays makes the overlap wider. The negative case must still win.
test("a negative count reads as negative under a threshold entered in trays", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
    lowStockThresholdInDefaultUnits: 5,
  });
  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 1 },
    ],
  });

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "tray", quantity: 2 }],
    allowNegative: true,
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: -30,
    lowStockStatus: "negative",
  });
});

test("an archived product carries no low-stock status under a per-product threshold", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
    lowStockThresholdInDefaultUnits: 5,
  });
  await t.mutation(api.products.archive, { id: eggs });

  expect((await t.query(api.products.get, { id: eggs }))?.lowStockStatus).toBe(
    undefined,
  );
});

test("clearing a per-product override falls back to the shop-wide threshold", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
    lowStockThresholdInDefaultUnits: 5,
  });
  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 8 },
    ],
  });

  // Eight trays clears an override of five, and falls under the shop-wide ten.
  await t.mutation(api.products.update, {
    id: eggs,
    lowStockThresholdInDefaultUnits: null,
  });

  const cleared = await t.query(api.products.get, { id: eggs });
  expect(cleared).toMatchObject({ lowStockStatus: "low" });
  expect(cleared?.lowStockThreshold).toBe(undefined);
  expect(cleared?.lowStockThresholdInDefaultUnits).toBe(undefined);
});

test("a threshold entered in a Default unit that does not divide it reads back the number entered", async () => {
  const t = setupTest();
  const eggs = await t.mutation(api.products.create, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
    defaultUnitLabel: "tray",
    // Half a tray is 15 pieces. A threshold is a quantity, and the shop sells
    // fractions of a tray, so nothing here rounds the entry up to a whole one.
    lowStockThresholdInDefaultUnits: 0.5,
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    lowStockThreshold: 15,
    lowStockThresholdInDefaultUnits: 0.5,
  });
});
