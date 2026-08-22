import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  buildReadingLadder,
  formatReading,
  readQuantity,
} from "./remainderReading";
import {
  aCustomer,
  aProductHolding,
  aSupplier,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";
import { formatCount } from "./unitLabels";

test("an archived product's name still renders on its own ledger and on past delivery lines", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20, { name: "Coke 1.5L" });
  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
  });

  await t.mutation(api.products.archive, { id: coke });

  const deliveries = await t.query(api.deliveries.list, {});
  expect(deliveries.find((d) => d._id === deliveryId)?.lines).toMatchObject([
    { productName: "Coke 1.5L" },
  ]);

  const ledger = await t.query(api.stockMovements.listForProduct, {
    productId: coke,
  });
  expect(ledger.length).toBeGreaterThan(0);
});

test("the ledger runs oldest to newest, and the newest row's running balance equals quantityOnHand", async () => {
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
  // The Delivery the fixture stocked the product with.
  expect(rows[2].type).toBe("delivery");

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
    items: [{ productId: coke, unitLabel: "pc", quantity: 3 }],
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

  // Newest first: +3 Delivery (10), -8 Pull-out (7), +5 Delivery (15), and the
  // fixture's own Delivery (10).
  expect(rows.map((r) => r.runningBalance)).toEqual([10, 7, 15, 10]);
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

test("a product's ledger names a delivery's supplier", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const supplierId = await aSupplier(t, "Aling Rosa Distribution");

  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
    supplierId,
  });

  const ledger = await t.query(api.stockMovements.listForProduct, {
    productId: coke,
  });
  expect(ledger[0]).toMatchObject({
    type: "delivery",
    supplierName: "Aling Rosa Distribution",
  });
});

test("a delivery attached to a deleted supplier still renders its name on the ledger", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const supplierId = await aSupplier(t, "Ghost Supplier");
  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
    supplierId,
  });
  await t.mutation(api.suppliers.archive, { id: supplierId });
  await t.mutation(api.suppliers.remove, { id: supplierId });

  const ledger = await t.query(api.stockMovements.listForProduct, {
    productId: coke,
  });
  expect(ledger[0]).toMatchObject({ supplierName: "Ghost Supplier" });
});

test("editEntry changes a delivery's supplier after the fact", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const originalSupplier = await aSupplier(t, "Original Supplier");
  const newSupplier = await aSupplier(t, "New Supplier");

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 10 }],
    supplierId: originalSupplier,
  });
  const [line] = (await t.query(api.deliveries.list, {}))[0].lines;

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 10 }],
    supplierId: newSupplier,
  });

  expect(
    await t.query(api.stockMovements.getEntry, {
      entry: { type: "delivery", entryId: deliveryId },
    }),
  ).toMatchObject({ supplierId: newSupplier });
});

test("editEntry clears a delivery's supplier when passed null", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const supplierId = await aSupplier(t, "Original Supplier");

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 10 }],
    supplierId,
  });
  const [line] = (await t.query(api.deliveries.list, {}))[0].lines;

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 10 }],
    supplierId: null,
  });

  expect(
    (
      await t.query(api.stockMovements.getEntry, {
        entry: { type: "delivery", entryId: deliveryId },
      })
    ).supplierId,
  ).toBe(undefined);
});

// An edit to an unrelated field must never touch the supplier. The field here
// is the Unit quantity. A call that omits `supplierId` leaves it exactly as it
// was.
test("editEntry leaves a delivery's supplier untouched when the edit doesn't mention it", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const supplierId = await aSupplier(t, "Untouched Supplier");

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 10 }],
    supplierId,
  });
  const [line] = (await t.query(api.deliveries.list, {}))[0].lines;

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 12 }],
  });

  expect(
    await t.query(api.stockMovements.getEntry, {
      entry: { type: "delivery", entryId: deliveryId },
    }),
  ).toMatchObject({ supplierId });
});

// The load-bearing case from the ticket. An archived supplier that a Delivery
// already names survives an edit to an unrelated field.
test("editing an unrelated field on a delivery whose supplier is archived leaves that supplier attached", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const supplierId = await aSupplier(t, "Archived Supplier");

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 10 }],
    supplierId,
  });
  await t.mutation(api.suppliers.archive, { id: supplierId });
  const [line] = (await t.query(api.deliveries.list, {}))[0].lines;

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ movementId: line.movementId, productId: coke, quantity: 15 }],
  });

  expect(
    await t.query(api.stockMovements.getEntry, {
      entry: { type: "delivery", entryId: deliveryId },
    }),
  ).toMatchObject({ supplierId });
});

test("editEntry ignores supplierId for a pull-out", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const supplierId = await aSupplier(t);

  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 5 }],
    reasonCategory: "damaged",
  });
  const [line] = (await t.query(api.pullouts.list, {}))[0].lines;

  // `supplierId` is not a Pull-out concept. The args accept it, because they
  // are not typed per entry type. The handler only ever patches it onto a
  // `deliveries` doc, so a stray value here has nowhere to land.
  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "pullout", entryId: pulloutId },
      lines: [{ movementId: line.movementId, productId: coke, quantity: 2 }],
      reasonCategory: "damaged",
      supplierId,
    }),
  ).resolves.not.toThrow();
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

  // Raising the existing Line to 2 and adding a second Line of 1 more nets
  // -1 on coke. That is a Negative projection. Neither Line alone reads that
  // way against the stale count each was typed against.
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
    items: [{ productId: coke, unitLabel: "pc", quantity: 3 }],
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
  // The 5 on hand is the fixture's 5, plus the +10 Delivery, less the -10
  // Pull-out below. A drop of the Delivery Line to 2 would take coke to -3.
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

const EGGS_UNITS = [
  { label: "piece", baseEquivalent: 1, price: 8 },
  { label: "tray", baseEquivalent: 30, price: 220 },
];

test("editEntry rejects an in-place Unit change on a surviving line", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 2 },
    ],
  });
  const [line] = (await t.query(api.deliveries.list, {}))[0].lines;

  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "delivery", entryId: deliveryId },
      lines: [
        {
          movementId: line.movementId,
          productId: eggs,
          unitLabel: "piece",
          quantity: 2,
        },
      ],
    }),
  ).rejects.toThrow(/Unit can't change/);
  await expectCacheMatchesLedger(t, eggs);
});

test("editEntry treats a Unit change as dropping the old line and inserting a new one", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 2 },
    ],
  });

  // The new Line carries no `movementId`. That is the sheet's way of saying
  // this Line's Unit changed. The mutation handles it as a drop and an insert.
  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [{ productId: eggs, unitLabel: "piece", quantity: 12 }],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 12, // the 2-tray line reversed, 12 pieces added
  });
  const entry = (await t.query(api.deliveries.list, {}))[0];
  expect(entry.lines).toMatchObject([{ unitLabel: "piece", unitQuantity: 12 }]);
  await expectCacheMatchesLedger(t, eggs);
});

test("editEntry's below-zero warning nets a delivery edit across two Units for one product", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 2 },
      { kind: "existing", productId: eggs, unitLabel: "piece", quantity: 5 },
    ],
  });
  // 65 on hand from the Delivery, then 60 pulled out elsewhere, which leaves 5.
  await t.mutation(api.pullouts.create, {
    lines: [{ productId: eggs, quantity: 60 }],
    reasonCategory: "damaged",
  });
  const lines = (await t.query(api.deliveries.list, {}))[0].lines;
  const trayLine = lines.find((l) => l.unitLabel === "tray");
  const pieceLine = lines.find((l) => l.unitLabel === "piece");
  if (!trayLine || !pieceLine) throw new Error("Missing a line");

  // A drop of the tray Line to 1 and the piece Line to 1 nets -34 against the
  // 5 left. That is a Negative projection. Neither Line alone reads that way
  // against the Delivery's own original Unit quantities.
  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "delivery", entryId: deliveryId },
      lines: [
        { movementId: trayLine.movementId, productId: eggs, quantity: 1 },
        { movementId: pieceLine.movementId, productId: eggs, quantity: 1 },
      ],
    }),
  ).rejects.toThrow(/Eggs/);

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    lines: [
      { movementId: trayLine.movementId, productId: eggs, quantity: 1 },
      { movementId: pieceLine.movementId, productId: eggs, quantity: 1 },
    ],
    allowNegative: true,
  });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: -29, // 5 - 30 - 4
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("deleteEntry reverses a delivery recorded in a non-Base Unit exactly", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 10, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 3 },
    ],
  });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 100, // 10 + 3 * 30
  });

  await t.mutation(api.stockMovements.deleteEntry, {
    entry: { type: "delivery", entryId: deliveryId },
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 10, // back to exactly where it was
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("editEntry rejects an in-place Unit change on a surviving pull-out line", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 100, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [{ productId: eggs, unitLabel: "tray", quantity: 2 }],
    reasonCategory: "damaged",
  });
  const [line] = (await t.query(api.pullouts.list, {}))[0].lines;

  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "pullout", entryId: pulloutId },
      lines: [
        {
          movementId: line.movementId,
          productId: eggs,
          unitLabel: "piece",
          quantity: 2,
        },
      ],
      reasonCategory: "damaged",
    }),
  ).rejects.toThrow(/Unit can't change/);
  await expectCacheMatchesLedger(t, eggs);
});

test("editEntry treats a pull-out line's Unit change as dropping the old line and inserting a new one", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 100, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [{ productId: eggs, unitLabel: "tray", quantity: 2 }],
    reasonCategory: "damaged",
  });

  // The new Line carries no `movementId`. That is the sheet's way of saying
  // this Line's Unit changed. The mutation handles it as a drop and an insert.
  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "pullout", entryId: pulloutId },
    lines: [{ productId: eggs, unitLabel: "piece", quantity: 12 }],
    reasonCategory: "damaged",
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 88, // 100 - 2 trays (-60), then the tray line reversed (+60) - 12 pieces pulled
  });
  const entry = (await t.query(api.pullouts.list, {}))[0];
  expect(entry.lines).toMatchObject([
    { unitLabel: "piece", unitQuantity: -12 },
  ]);
  await expectCacheMatchesLedger(t, eggs);
});

test("editEntry's below-zero warning nets a pull-out edit across two Units for one product", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 40, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [
      { productId: eggs, unitLabel: "tray", quantity: 1 },
      { productId: eggs, unitLabel: "piece", quantity: 5 },
    ],
    reasonCategory: "damaged",
    allowNegative: true, // 40 - 30 - 5 = 5 on hand
  });
  const lines = (await t.query(api.pullouts.list, {}))[0].lines;
  const trayLine = lines.find((l) => l.unitLabel === "tray");
  const pieceLine = lines.find((l) => l.unitLabel === "piece");
  if (!trayLine || !pieceLine) throw new Error("Missing a line");

  // The tray Line rises from 1 to 2, and the piece Line from 5 to 6. That nets
  // -31 against the 5 left, which is a Negative projection. Neither Line alone
  // reads that way against the Pull-out's own original Unit quantities.
  await expect(
    t.mutation(api.stockMovements.editEntry, {
      entry: { type: "pullout", entryId: pulloutId },
      lines: [
        { movementId: trayLine.movementId, productId: eggs, quantity: 2 },
        { movementId: pieceLine.movementId, productId: eggs, quantity: 6 },
      ],
      reasonCategory: "damaged",
    }),
  ).rejects.toThrow(/Eggs/);

  await t.mutation(api.stockMovements.editEntry, {
    entry: { type: "pullout", entryId: pulloutId },
    lines: [
      { movementId: trayLine.movementId, productId: eggs, quantity: 2 },
      { movementId: pieceLine.movementId, productId: eggs, quantity: 6 },
    ],
    reasonCategory: "damaged",
    allowNegative: true,
  });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: -26, // 5 - 30 - 1
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("deleteEntry reverses a pull-out recorded in a non-Base Unit exactly", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 100, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [{ productId: eggs, unitLabel: "tray", quantity: 3 }],
    reasonCategory: "damaged",
  });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 10, // 100 - 3 * 30
  });

  await t.mutation(api.stockMovements.deleteEntry, {
    entry: { type: "pullout", entryId: pulloutId },
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 100, // back to exactly where it was
  });
  await expectCacheMatchesLedger(t, eggs);
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

  // A header row with no Movements pointing at it yet. The create mutations
  // never produce this shape. It is exactly the shape a bogus `entryId` paired
  // with an all-new Line set would otherwise sail through as.
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

  // Keep the coke Line at a changed Unit quantity, drop the pancit Line, and
  // add a brand-new noodles Line. That is a delete, a patch, and an insert in
  // one save.
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

test("deleteEntry reverses a delivery's lines and removes the header", async () => {
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

  await t.mutation(api.stockMovements.deleteEntry, {
    entry: { type: "delivery", entryId: deliveryId },
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 20,
  });
  expect(await t.query(api.products.get, { id: pancit })).toMatchObject({
    quantityOnHand: 10,
  });
  expect(
    (await t.query(api.deliveries.list, {})).find((e) => e._id === deliveryId),
  ).toBeUndefined();
  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
});

test("deleteEntry reverses a pull-out's lines and removes the header", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 5 }],
    reasonCategory: "damaged",
  });

  await t.mutation(api.stockMovements.deleteEntry, {
    entry: { type: "pullout", entryId: pulloutId },
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 20,
  });
  expect(
    (await t.query(api.pullouts.list, {})).find((e) => e._id === pulloutId),
  ).toBeUndefined();
  await expectCacheMatchesLedger(t, coke);
});

test("deleteEntry rejects a sale entry — those are deleted from the Register", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  const saleId = await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: coke, unitLabel: "pc", quantity: 3 }],
  });

  await expect(
    t.mutation(api.stockMovements.deleteEntry, {
      entry: { type: "sale", entryId: saleId },
    }),
  ).rejects.toThrow(/Register/);
  await expectCacheMatchesLedger(t, coke);
});

test("deleteEntry rejects an entry with no existing rows", async () => {
  const t = setupTest();

  const orphanDeliveryId = await t.run(
    async (ctx) => await ctx.db.insert("deliveries", { createdAt: Date.now() }),
  );

  await expect(
    t.mutation(api.stockMovements.deleteEntry, {
      entry: { type: "delivery", entryId: orphanDeliveryId },
    }),
  ).rejects.toThrow(/does not exist/);
});

test("deleteEntry judges the negative-stock warning on the entry's net effect across two lines for the same product", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 5, { name: "Coke 1.5L" });

  // A Delivery of 10, then a Pull-out of 10 that used part of it, leaves coke
  // at 5. A delete of the Delivery reverses +10, which would take coke to -5.
  // The Pull-out's -10 is still on the Ledger.
  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 10 }],
  });
  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 10 }],
    reasonCategory: "damaged",
    allowNegative: true,
  });

  await expect(
    t.mutation(api.stockMovements.deleteEntry, {
      entry: { type: "delivery", entryId: deliveryId },
    }),
  ).rejects.toThrow(/Coke 1\.5L/);

  await t.mutation(api.stockMovements.deleteEntry, {
    entry: { type: "delivery", entryId: deliveryId },
    allowNegative: true,
  });
  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: -5,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("deleteEntry cascades every line's own delta, not just the first product touched", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 5, { name: "Coke 1.5L" });
  const pancit = await aProductHolding(t, 5, {
    name: "Lucky Me Pancit Canton",
  });

  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [
      { productId: coke, quantity: 5 },
      { productId: pancit, quantity: 5 },
    ],
    reasonCategory: "damaged",
  });

  await t.mutation(api.stockMovements.deleteEntry, {
    entry: { type: "pullout", entryId: pulloutId },
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 5,
  });
  expect(await t.query(api.products.get, { id: pancit })).toMatchObject({
    quantityOnHand: 5,
  });
  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
});

test("each ledger row reads in the Unit it was recorded in, while the running balance stays in Base units", async () => {
  const t = setupTest();
  // The fixture stocks a product in its Base unit. The Ledger therefore holds
  // two piece rows and one tray row against one product.
  const eggs = await aProductHolding(t, 60, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 2 },
    ],
  });
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "piece", quantity: 5 }],
  });

  const rows = await t.query(api.stockMovements.listForProduct, {
    productId: eggs,
  });

  expect(rows).toMatchObject([
    { unitLabel: "piece", unitQuantity: -5, netChange: -5 },
    { unitLabel: "tray", unitQuantity: 2, netChange: 60 },
    { unitLabel: "piece", unitQuantity: 60, netChange: 60 },
  ]);
  // The balance is in Base units on every row, and the rows read newest first.
  expect(rows.map((r) => r.runningBalance)).toEqual([115, 120, 60]);
  await expectCacheMatchesLedger(t, eggs);
});

test("a movement whose Unit the product no longer holds still reads under the label it was recorded with", async () => {
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

  // The shop stops selling eggs by the tray. The Unit leaves the product.
  await t.mutation(api.products.update, {
    id: eggs,
    units: [{ label: "piece", baseEquivalent: 1, price: 8 }],
  });

  const rows = await t.query(api.stockMovements.listForProduct, {
    productId: eggs,
  });
  expect(rows[0]).toMatchObject({
    unitLabel: "tray",
    unitQuantity: -2,
    // The snapshot holds, so the row still comes to 60 pieces.
    netChange: -60,
    lineTotal: 440,
  });
  // What the row reads as on screen. The Ledger lays the count out itself, the
  // same way the Register does. See unitLabels.ts.
  expect(formatCount(rows[0].unitQuantity, rows[0].unitLabel)).toBe("-2 trays");
  await expectCacheMatchesLedger(t, eggs);
});

test("the running balance reads against the product's Reading ladder, whatever Unit each row was recorded in", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 60, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.products.update, {
    id: eggs,
    denominationLabels: ["tray"],
  });

  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 2 },
    ],
  });
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "piece", quantity: 5 }],
  });

  const rows = await t.query(api.stockMovements.listForProduct, {
    productId: eggs,
  });
  const product = await t.query(api.products.get, { id: eggs });
  if (!product) throw new Error("No product");
  const ladder = buildReadingLadder(product);

  // The product detail page reads the column this way. Every row goes through
  // one ladder, so a tray row and a piece row give the same kind of reading.
  expect(
    rows.map((r) => formatReading(readQuantity(r.runningBalance, ladder))),
  ).toEqual(["3 trays, 25 pieces", "4 trays", "2 trays"]);
});
