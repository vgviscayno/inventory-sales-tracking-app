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
    { productName: "Coke 1.5L", quantity: -2 },
    { productName: "Lucky Me Pancit Canton", quantity: -5 },
  ]);
  expect(entries[1]).toMatchObject({
    reasonCategory: "personal use",
    netChange: -4,
  });
});

test("cache tracks the ledger through a mixed delivery and pull-out sequence, including ending negative", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 10, { name: "Coke 1.5L" });

  await t.mutation(api.deliveries.create, {
    lines: [{ productId: coke, quantity: 5 }],
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
    lines: [{ productId: coke, quantity: 3 }],
  });

  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 0,
  });
  await expectCacheMatchesLedger(t, coke);
});
