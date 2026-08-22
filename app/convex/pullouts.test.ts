import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  aProductHolding,
  expectCacheMatchesLedger,
  setupTest,
} from "./test.helpers";

test("a pull-out lowers each product's count by its line quantity", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
  });

  await t.mutation(api.pullouts.create, {
    lines: [
      { productId: coke, quantity: 3 },
      { productId: pancit, quantity: 2 },
    ],
    reasonCategory: "damaged",
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 17,
  });
  expect(await t.query(api.products.get, { id: pancit })).toMatchObject({
    quantityOnHand: 8,
  });
  await expectCacheMatchesLedger(t, coke);
  await expectCacheMatchesLedger(t, pancit);
});

test("two lines for the same product in one pull-out both move stock", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await t.mutation(api.pullouts.create, {
    lines: [
      { productId: coke, quantity: 3 },
      { productId: coke, quantity: 2 },
    ],
    reasonCategory: "expired",
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 15,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("a pull-out must have at least one line", async () => {
  const t = setupTest();

  await expect(
    t.mutation(api.pullouts.create, { lines: [], reasonCategory: "damaged" }),
  ).rejects.toThrow();
});

test("a pull-out line cannot carry a zero or negative quantity", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await expect(
    t.mutation(api.pullouts.create, {
      lines: [{ productId: coke, quantity: 0 }],
      reasonCategory: "damaged",
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.pullouts.create, {
      lines: [{ productId: coke, quantity: -3 }],
      reasonCategory: "damaged",
    }),
  ).rejects.toThrow();

  await expectCacheMatchesLedger(t, coke);
});

test('"other" is refused without a note', async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await expect(
    t.mutation(api.pullouts.create, {
      lines: [{ productId: coke, quantity: 3 }],
      reasonCategory: "other",
    }),
  ).rejects.toThrow(/note/i);
  await expect(
    t.mutation(api.pullouts.create, {
      lines: [{ productId: coke, quantity: 3 }],
      reasonCategory: "other",
      reasonNotes: "   ",
    }),
  ).rejects.toThrow(/note/i);

  await expectCacheMatchesLedger(t, coke);
});

test('"other" succeeds once a note is given, and the note is preserved', async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 3 }],
    reasonCategory: "other",
    reasonNotes: "box fell off the tricycle",
  });

  const entries = await t.query(api.pullouts.list, {});
  expect(entries).toMatchObject([
    { reasonCategory: "other", reasonNotes: "box fell off the tricycle" },
  ]);
});

test("a reasonCategory outside the fixed set is rejected", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20);

  await expect(
    t.mutation(api.pullouts.create, {
      lines: [{ productId: coke, quantity: 3 }],
      // biome-ignore lint/suspicious/noExplicitAny: deliberately outside the args validator's fixed set
      reasonCategory: "stolen" as any,
    }),
  ).rejects.toThrow();
});

test("a pull-out that would drive stock negative is refused without the flag", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 2, { name: "Coke 1.5L" });

  await expect(
    t.mutation(api.pullouts.create, {
      lines: [{ productId: coke, quantity: 3 }],
      reasonCategory: "damaged",
    }),
  ).rejects.toThrow(/Coke 1\.5L/);

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 2,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("allowNegative records the pull-out and lands the negative count", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 2);

  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 5 }],
    reasonCategory: "damaged",
    allowNegative: true,
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: -3,
  });
  await expectCacheMatchesLedger(t, coke);
});

test("pull-outs list newest first, each carrying its lines, reason, and net change", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20, { name: "Coke 1.5L" });
  const pancit = await aProductHolding(t, 10, {
    name: "Lucky Me Pancit Canton",
  });

  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 4 }],
    reasonCategory: "personal use",
  });
  await t.mutation(api.pullouts.create, {
    lines: [
      { productId: coke, quantity: 2 },
      { productId: pancit, quantity: 5 },
    ],
    reasonCategory: "given away",
  });

  const entries = await t.query(api.pullouts.list, {});

  expect(entries).toHaveLength(2);
  // Newest first.
  expect(entries[0]).toMatchObject({
    reasonCategory: "given away",
    netChange: -7,
  });
  expect(entries[0].lines).toMatchObject([
    { productName: "Coke 1.5L", baseAmount: -2 },
    { productName: "Lucky Me Pancit Canton", baseAmount: -5 },
  ]);
  expect(entries[1]).toMatchObject({
    reasonCategory: "personal use",
    netChange: -4,
  });
});

const EGGS_UNITS = [
  { label: "piece", baseEquivalent: 1, price: 8 },
  { label: "tray", baseEquivalent: 30, price: 220 },
];

test("a pull-out line in a non-Base Unit moves stock by the derived Base amount", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 210, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  await t.mutation(api.pullouts.create, {
    lines: [{ productId: eggs, unitLabel: "tray", quantity: 5 }],
    reasonCategory: "damaged",
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 60, // 210 - 5 * 30
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("one pull-out can carry the same product on two lines in two Units, summing the derived amount", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 200, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  const pulloutId = await t.mutation(api.pullouts.create, {
    lines: [
      { productId: eggs, unitLabel: "tray", quantity: 5 },
      { productId: eggs, unitLabel: "piece", quantity: 12 },
    ],
    reasonCategory: "expired",
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 38, // 200 - (5 * 30 + 12)
  });
  const entry = (await t.query(api.pullouts.list, {})).find(
    (e) => e._id === pulloutId,
  );
  expect(entry?.lines).toHaveLength(2);
  expect(entry?.netChange).toBe(-162);
  await expectCacheMatchesLedger(t, eggs);
});

test("a pull-out line with no Unit named falls back to the product's Default unit", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 200, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });
  await t.mutation(api.products.update, {
    id: eggs,
    defaultUnitLabel: "tray",
  });

  await t.mutation(api.pullouts.create, {
    lines: [{ productId: eggs, quantity: 3 }],
    reasonCategory: "damaged",
  });

  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: 110, // 200 - 3 trays, not 3 pieces
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("the below-zero warning sums a Unit-carrying pull-out's lines across the whole entry", async () => {
  const t = setupTest();
  const eggs = await aProductHolding(t, 40, {
    name: "Eggs",
    units: EGGS_UNITS,
    baseUnitLabel: "piece",
  });

  // 1 tray (30) plus 12 pieces is 42, against 40 on hand. That is a Negative
  // projection, though neither Line alone gives one.
  await expect(
    t.mutation(api.pullouts.create, {
      lines: [
        { productId: eggs, unitLabel: "tray", quantity: 1 },
        { productId: eggs, unitLabel: "piece", quantity: 12 },
      ],
      reasonCategory: "damaged",
    }),
  ).rejects.toThrow(/Eggs/);

  await t.mutation(api.pullouts.create, {
    lines: [
      { productId: eggs, unitLabel: "tray", quantity: 1 },
      { productId: eggs, unitLabel: "piece", quantity: 12 },
    ],
    reasonCategory: "damaged",
    allowNegative: true,
  });
  expect(await t.query(api.products.get, { id: eggs })).toMatchObject({
    quantityOnHand: -2, // 40 - 30 - 12
  });
  await expectCacheMatchesLedger(t, eggs);
});

test("cache tracks the ledger through a mixed delivery and pull-out sequence, including ending negative", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 10, { name: "Coke 1.5L" });

  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 5 }],
  });
  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 8 }],
    reasonCategory: "expired",
  });
  await t.mutation(api.pullouts.create, {
    lines: [{ productId: coke, quantity: 10 }],
    reasonCategory: "damaged",
    allowNegative: true,
  });
  await t.mutation(api.deliveries.create, {
    lines: [{ kind: "existing", productId: coke, quantity: 3 }],
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 0,
  });
  await expectCacheMatchesLedger(t, coke);
});
