import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  aProductHolding,
  aSupplier,
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
      { kind: "existing", productId: coke, quantity: 12 },
      { kind: "existing", productId: pancit, quantity: 5 },
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
      { kind: "existing", productId: coke, quantity: 3 },
      { kind: "existing", productId: coke, quantity: 2 },
    ],
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 25,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("a delivery saves fine with no supplier", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
  });

  const entry = await t.run((ctx) => ctx.db.get(deliveryId));
  expect(entry?.supplierId).toBe(undefined);
});

test("a delivery can carry a supplier chosen at creation", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const supplierId = await aSupplier(t, "Aling Rosa Distribution");

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
    supplierId,
  });

  const entry = await t.run((ctx) => ctx.db.get(deliveryId));
  expect(entry?.supplierId).toBe(supplierId);
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
      lines: [{ kind: "existing", productId: coke, quantity: 0 }],
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.deliveries.create, {
      lines: [{ kind: "existing", productId: coke, quantity: -3 }],
    }),
  ).rejects.toThrow();

  await expectCacheMatchesLedger(t, coke);
});

test("a kind: new line creates the product and carries its quantity as the count", async () => {
  const t = setupTest();

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      {
        kind: "new",
        name: "Nissin Cup Noodles",
        unitLabel: "pc",
        price: 25,
        quantity: 8,
      },
    ],
  });

  const entries = await t.query(api.deliveries.list, {});
  const entry = entries.find((e) => e._id === deliveryId);
  expect(entry?.lines).toMatchObject([
    { productName: "Nissin Cup Noodles", baseAmount: 8 },
  ]);

  const products = await t.query(api.products.list, {});
  const created = products.find((p) => p.name === "Nissin Cup Noodles");
  expect(created).toMatchObject({
    baseUnitLabel: "pc",
    units: [{ label: "pc", baseEquivalent: 1, price: 25 }],
    quantityOnHand: 8,
  });
  if (!created) throw new Error("Product was not created");
  await expectCacheMatchesLedger(t, created._id);
});

test("a kind: new line with no selling price is rejected", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.deliveries.create, {
      lines: [
        {
          kind: "new",
          name: "No Price Item",
          unitLabel: "pc",
          price: 0,
          quantity: 3,
        },
      ],
    }),
  ).rejects.toThrow();

  const products = await t.query(api.products.list, {});
  expect(products.find((p) => p.name === "No Price Item")).toBeUndefined();
});

test("a delivery line's shape is enforced by the union validator, not a hand-rolled check", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await expect(
    t.mutation(api.deliveries.create, {
      lines: [
        {
          kind: "existing",
          productId: coke,
          // @ts-expect-error a line can't mix an existing productId with a new product's fields
          name: "Coke 1.5L",
          sellingPrice: 75,
          quantity: 3,
        },
      ],
    }),
  ).rejects.toThrow();
  await expectCacheMatchesLedger(t, coke);

  await expect(
    // @ts-expect-error `kind` is required to disambiguate the union
    t.mutation(api.deliveries.create, { lines: [{ quantity: 3 }] }),
  ).rejects.toThrow();
});

test("a failed line leaves neither the new product nor the delivery behind", async () => {
  const t = setupTest();
  // The fixture holds zero. The only Delivery this test can see is the one it
  // tries to log, and fails to. A stocked fixture would log one of its own.
  const coke = await aProductHolding(t, 0);

  await expect(
    t.mutation(api.deliveries.create, {
      lines: [
        {
          kind: "new",
          name: "Rolled Back Item",
          unitLabel: "pc",
          price: 30,
          quantity: 4,
        },
        { kind: "existing", productId: coke, quantity: -1 },
      ],
    }),
  ).rejects.toThrow();

  const products = await t.query(api.products.list, {});
  expect(products.find((p) => p.name === "Rolled Back Item")).toBeUndefined();
  expect(await t.query(api.deliveries.list, {})).toHaveLength(0);
  await expectCacheMatchesLedger(t, coke);
});

const EGGS_UNITS = [
  { label: "piece", baseEquivalent: 1, price: 8 },
  { label: "tray", baseEquivalent: 30, price: 220 },
];

test("a delivery line in a non-Base Unit moves stock by the derived Base amount", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 60, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 5 },
    ],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 210, // 60 + 5 * 30
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("one delivery can carry the same product on two lines in two Units, summing the derived amount", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: eggs, unitLabel: "tray", quantity: 5 },
      { kind: "existing", productId: eggs, unitLabel: "piece", quantity: 12 },
    ],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 162, // 5 * 30 + 12
  });
  const entry = (await t.query(api.deliveries.list, {})).find(
    (e) => e._id === deliveryId,
  );
  expect(entry?.lines).toHaveLength(2);
  expect(entry?.netChange).toBe(162);
  await expectCacheMatchesLedger(t, eggs);
});

test("an existing line with no Unit named falls back to the product's Default unit", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 0, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.products.update, {
    id: eggs,
    defaultUnitLabel: "tray",
  });

  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: eggs, quantity: 3 }],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 90, // 3 trays, not 3 pieces
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("deliveries list newest first, each carrying its lines and net change", async () => {
  const t = setupTest();
  // Both fixtures hold zero. This test counts Deliveries, and a stocked fixture
  // logs one of its own. That Delivery would sit in the list beside them.
  const coke = await aProductHolding(t, 0, { name: "Coke 1.5L" });
  const pancit = await aProductHolding(t, 0, {
    name: "Lucky Me Pancit Canton",
  });

  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 12 }],
  });
  await t.mutation(api.deliveries.create, {
    lines: [
      { kind: "existing", productId: coke, quantity: 4 },
      { kind: "existing", productId: pancit, quantity: 5 },
    ],
  });

  const entries = await t.query(api.deliveries.list, {});

  expect(entries).toHaveLength(2);
  // Newest first.
  expect(entries[0].netChange).toBe(9);
  expect(entries[0].lines).toMatchObject([
    { productName: "Coke 1.5L", baseAmount: 4 },
    { productName: "Lucky Me Pancit Canton", baseAmount: 5 },
  ]);
  expect(entries[1].netChange).toBe(12);
  expect(entries[1].lines).toMatchObject([
    { productName: "Coke 1.5L", baseAmount: 12 },
  ]);
});

// A shipment arrives in bulk, so a product based in the piece is still
// received as "10 trays". The Line that creates the product therefore declares
// the tray beside the piece, and counts itself in it.
test("a kind: new Line declares a second Unit and records its Unit quantity in it", async () => {
  const t = setupTest();

  const deliveryId = await t.mutation(api.deliveries.create, {
    lines: [
      {
        kind: "new",
        name: "Eggs Medium",
        unitLabel: "piece",
        price: 8,
        extraUnits: [{ label: "tray", baseEquivalent: 30, price: 220 }],
        quantityUnitLabel: "tray",
        quantity: 10,
      },
    ],
  });

  const products = await t.query(api.products.list, {});
  const created = products.find((p) => p.name === "Eggs Medium");
  expect(created).toMatchObject({
    baseUnitLabel: "piece",
    units: [
      { label: "piece", baseEquivalent: 1, price: 8 },
      { label: "tray", baseEquivalent: 30, price: 220 },
    ],
    quantityOnHand: 300,
  });

  // The Movement reads back the way it was entered, and not as 300 pieces.
  const entries = await t.query(api.deliveries.list, {});
  expect(entries.find((e) => e._id === deliveryId)?.lines).toMatchObject([
    { unitLabel: "tray", unitQuantity: 10, baseAmount: 300 },
  ]);

  if (!created) throw new Error("Product was not created");
  await expectCacheMatchesLedger(t, created._id);
});

// The step that creates the product leaves the second Unit's price optional.
// A product's Unit may not go without a price, so the Base unit's price
// stands in at the second Unit's own Base equivalent.
test("a second Unit with no price of its own prices from the Base unit", async () => {
  const t = setupTest();

  await t.mutation(api.deliveries.create, {
    lines: [
      {
        kind: "new",
        name: "Eggs Medium",
        unitLabel: "piece",
        price: 8,
        extraUnits: [{ label: "tray", baseEquivalent: 30 }],
        quantity: 2,
      },
    ],
  });

  const products = await t.query(api.products.list, {});
  expect(products.find((p) => p.name === "Eggs Medium")).toMatchObject({
    units: [
      { label: "piece", baseEquivalent: 1, price: 8 },
      { label: "tray", baseEquivalent: 30, price: 240 },
    ],
    // The Line named no Unit, so it counts the Base unit.
    quantityOnHand: 2,
  });
});

test("a second Unit repeating the Base unit's label is rejected", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.deliveries.create, {
      lines: [
        {
          kind: "new",
          name: "Eggs Medium",
          unitLabel: "tray",
          price: 220,
          extraUnits: [{ label: "Tray", baseEquivalent: 30 }],
          quantity: 1,
        },
      ],
    }),
  ).rejects.toThrow();

  const products = await t.query(api.products.list, {});
  expect(products.find((p) => p.name === "Eggs Medium")).toBeUndefined();
});

test("a second Unit with a fractional Base equivalent is rejected", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.deliveries.create, {
      lines: [
        {
          kind: "new",
          name: "Eggs Medium",
          unitLabel: "piece",
          price: 8,
          extraUnits: [{ label: "half tray", baseEquivalent: 0.5 }],
          quantity: 1,
        },
      ],
    }),
  ).rejects.toThrow();

  const products = await t.query(api.products.list, {});
  expect(products.find((p) => p.name === "Eggs Medium")).toBeUndefined();
});

test("a quantityUnitLabel naming no Unit of the new product is rejected", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.deliveries.create, {
      lines: [
        {
          kind: "new",
          name: "Eggs Medium",
          unitLabel: "piece",
          price: 8,
          quantityUnitLabel: "tray",
          quantity: 10,
        },
      ],
    }),
  ).rejects.toThrow();

  const products = await t.query(api.products.list, {});
  expect(products.find((p) => p.name === "Eggs Medium")).toBeUndefined();
});

test("a kind: new line with no name is rejected", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.deliveries.create, {
      lines: [
        { kind: "new", name: "   ", unitLabel: "pc", price: 25, quantity: 3 },
      ],
    }),
  ).rejects.toThrow();

  expect(await t.query(api.deliveries.list, {})).toHaveLength(0);
});
