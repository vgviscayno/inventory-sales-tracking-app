import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";

const EGGS_UNITS = [
  { label: "piece", baseEquivalent: 1, price: 8 },
  { label: "tray", baseEquivalent: 30, price: 220 },
];

test("a sale in a non-Base Unit moves stock by the derived Base amount and prices off the Unit, not the Base amount", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 60, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  const saleId = await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: eggs, unitLabel: "tray", quantity: 2 }],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 0, // 60 - 2 * 30
  });
  const [sale] = await t.query(api.sales.list, {});
  expect(sale._id).toBe(saleId);
  expect(sale.totalAmount).toBe(440); // 2 * 220, never 2 * 30 * 220 and never 60 * 8
  await expectCacheMatchesLedger(t, eggs);
});

test("each sale line rounds to centavos before the total is summed", async () => {
  const t = setupTest();
  // A price and quantity chosen so the raw product carries float noise
  // (0.1 * 3 !== 0.3 in floating point) that has to be rounded away per line.
  const rice = await aProductHolding(t, 5000, {
    name: "Rice",
    units: [{ label: "g", baseEquivalent: 1, price: 0.1 }],
    baseUnitLabel: "g",
  });

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: rice, unitLabel: "g", quantity: 3 }],
  });

  const [sale] = await t.query(api.sales.list, {});
  expect(sale.totalAmount).toBe(0.3);
});

test("selling by the kilo against a gram-based product lands exact grams — 1.7 kg is 1700 g, not 1700.0000000000002", async () => {
  const t = setupTest();
  const rice = await aProductHolding(t, 5000, {
    name: "Rice",
    units: [
      { label: "g", baseEquivalent: 1, price: 0.08 },
      { label: "kg", baseEquivalent: 1000, price: 75 },
    ],
    baseUnitLabel: "g",
  });

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: rice, unitLabel: "kg", quantity: 1.7 }],
  });

  expect(await t.query(api.products.get, { id: rice })).toMatchObject({
    quantityOnHand: 3300, // 5000 - 1700, an exact integer
  });
  await expectCacheMatchesLedger(t, rice);
});

test("a sale carrying one product on two lines in two Units lands as two rows and takes the right total off stock", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 100, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [
      { productId: eggs, unitLabel: "tray", quantity: 1 },
      { productId: eggs, unitLabel: "piece", quantity: 5 },
    ],
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 65, // 100 - 30 - 5
  });
  const [sale] = await t.query(api.sales.list, {});
  expect(sale.lines).toHaveLength(2);
  await expectCacheMatchesLedger(t, eggs);
});

// A sale mixing Units is exactly the case "every fold over the ledger becomes
// a fold over derived Base amounts" exists to protect: summing the raw,
// per-line Unit-quantities (-1 tray + -5 pieces = -6) would badly understate
// what actually left the shelf (-35 pieces).
test("a mixed-Unit sale's netChange is folded in Base amounts, not summed across Unit-quantities", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 100, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [
      { productId: eggs, unitLabel: "tray", quantity: 1 },
      { productId: eggs, unitLabel: "piece", quantity: 5 },
    ],
  });

  const [sale] = await t.query(api.sales.list, {});
  expect(sale.netChange).toBe(-35); // -(1 * 30) + -(5 * 1)
});

test("the below-zero warning judges all of a product's lines together, across Units", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 60, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  // 2 trays (60) + 5 pieces (5) = 65 against 60 on hand: oversold, even
  // though neither line alone would read that way.
  await expect(
    t.mutation(api.sales.create, {
      paymentMethod: "cash",
      items: [
        { productId: eggs, unitLabel: "tray", quantity: 2 },
        { productId: eggs, unitLabel: "piece", quantity: 5 },
      ],
    }),
  ).rejects.toThrow(/Eggs/);

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [
      { productId: eggs, unitLabel: "tray", quantity: 2 },
      { productId: eggs, unitLabel: "piece", quantity: 5 },
    ],
    allowNegative: true,
  });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: -5,
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("repeated decimal-Unit writes and reads accumulate no float drift in quantityOnHand", async () => {
  const t = setupTest();
  const rice = await aProductHolding(t, 5000, {
    name: "Rice",
    units: [
      { label: "g", baseEquivalent: 1, price: 0.08 },
      { label: "kg", baseEquivalent: 1000, price: 75 },
    ],
    baseUnitLabel: "g",
  });

  for (let i = 0; i < 5; i++) {
    await t.mutation(api.sales.create, {
      paymentMethod: "cash",
      items: [{ productId: rice, unitLabel: "kg", quantity: 1.7 }],
      allowNegative: true,
    });
  }

  // Each of the 5 sales rounds to exactly 1700g on write, so the cache is an
  // exact integer, not `5000 - 5 * 1.7 * 1000` accumulated as float noise.
  expect(await t.query(api.products.get, { id: rice })).toMatchObject({
    quantityOnHand: -3500, // 5000 - 5 * 1700
  });
  await expectCacheMatchesLedger(t, rice);
});

test("a saved sale reads back showing the Unit it was recorded in", async () => {
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

  const [sale] = await t.query(api.sales.list, {});
  expect(sale.lines).toMatchObject([{ unitQuantity: -2, unitLabel: "tray" }]);

  const ledger = await t.query(api.stockMovements.listForProduct, {
    productId: eggs,
  });
  expect(ledger[0]).toMatchObject({
    unitLabel: "tray",
    unitQuantity: -2,
    netChange: -60,
  });
});

test("products.create refuses a product with no Base unit", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.products.create, {
      name: "Eggs",
      units: [],
      baseUnitLabel: "piece",
    }),
  ).rejects.toThrow();
});

test("products.create refuses a Base unit label not present among the Units", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.products.create, {
      name: "Eggs",
      units: [{ label: "piece", baseEquivalent: 1, price: 8 }],
      baseUnitLabel: "tray",
    }),
  ).rejects.toThrow();
});

test("products.create refuses a Base unit whose Base equivalent isn't 1", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.products.create, {
      name: "Eggs",
      units: [{ label: "piece", baseEquivalent: 30, price: 8 }],
      baseUnitLabel: "piece",
    }),
  ).rejects.toThrow();
});

test("products.create refuses a Unit with a non-whole Base equivalent", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.products.create, {
      name: "Eggs",
      units: [
        { label: "piece", baseEquivalent: 1, price: 8 },
        { label: "half-tray", baseEquivalent: 15.5, price: 110 },
      ],
      baseUnitLabel: "piece",
    }),
  ).rejects.toThrow();
});

test("changing a Unit's Base equivalent does not change what past movements came to — the snapshot holds", async () => {
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

  // Redefine a tray from 30 pieces to 12 — a change no public mutation makes
  // yet (Unit correction is a later ticket), reached under the API the same
  // way the cache-drift test does.
  await t.run(async (ctx) => {
    await ctx.db.patch(eggs, {
      units: [
        { label: "piece", baseEquivalent: 1, price: 8 },
        { label: "tray", baseEquivalent: 12, price: 220 },
      ],
    });
  });

  const ledger = await t.query(api.stockMovements.listForProduct, {
    productId: eggs,
  });
  // The already-recorded tray sale still reads as -30 pieces, not -12.
  expect(ledger[0]).toMatchObject({ netChange: -30 });
});
