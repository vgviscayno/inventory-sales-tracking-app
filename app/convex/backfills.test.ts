import { expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  expectCacheMatchesLedger,
  setupTest,
  type TestConvex,
} from "./test.helpers";

/**
 * A product with a count but no ledger behind it — the state every product is
 * in before the backfill runs. `aProductHolding` deliberately isn't used here:
 * it hands back a product that already has its opening row.
 */
async function aProductAwaitingItsOpeningRow(
  t: TestConvex,
  quantityOnHand: number,
  name = "Coke 1.5L",
) {
  return await t.mutation(api.products.create, {
    name,
    sellingPrice: 75,
    quantityOnHand,
  });
}

function movementRowsFor(t: TestConvex, productId: Id<"products">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("stockMovements")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .collect(),
  );
}

test("the backfill gives each product one opening row carrying its count", async () => {
  const t = setupTest();
  const coke = await aProductAwaitingItsOpeningRow(t, 20);
  const pancit = await aProductAwaitingItsOpeningRow(t, 7, "Pancit Canton");

  await t.mutation(internal.backfills.openingBalances, {});

  const cokeRows = await movementRowsFor(t, coke);
  expect(cokeRows).toMatchObject([{ type: "opening", quantity: 20 }]);
  const [cokeOpening] = cokeRows;
  // An opening row stands alone — there is no delivery or sale behind it.
  expect(cokeOpening).not.toHaveProperty("refId");
  expect(await movementRowsFor(t, pancit)).toMatchObject([
    { type: "opening", quantity: 7 },
  ]);
});

test("running the backfill twice adds nothing the second time", async () => {
  const t = setupTest();
  const coke = await aProductAwaitingItsOpeningRow(t, 20);

  await t.mutation(internal.backfills.openingBalances, {});
  const summary = await t.mutation(internal.backfills.openingBalances, {});

  expect(summary).toMatchObject({ openingRowsWritten: 0 });
  expect(await movementRowsFor(t, coke)).toHaveLength(1);
  expect(await t.query(api.products.get, { id: coke })).toMatchObject({
    quantityOnHand: 20,
  });
});

test("a product added between runs picks up its opening row on the second", async () => {
  const t = setupTest();
  await aProductAwaitingItsOpeningRow(t, 20);
  await t.mutation(internal.backfills.openingBalances, {});

  const pancit = await aProductAwaitingItsOpeningRow(t, 7, "Pancit Canton");
  const summary = await t.mutation(internal.backfills.openingBalances, {});

  expect(summary).toMatchObject({ openingRowsWritten: 1 });
  expect(await movementRowsFor(t, pancit)).toMatchObject([
    { type: "opening", quantity: 7 },
  ]);
});

test("a product that already has its opening row is left alone", async () => {
  const t = setupTest();
  const coke = await aProductAwaitingItsOpeningRow(t, 20);
  await t.mutation(internal.backfills.openingBalances, {});

  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: coke, quantity: 3 }],
  });
  await t.mutation(internal.backfills.openingBalances, {});

  expect(await movementRowsFor(t, coke)).toHaveLength(2);
  await expectCacheMatchesLedger(t, coke);
});

test("a product that sold before its first backfill opens at what it started with", async () => {
  const t = setupTest();
  await t.mutation(internal.backfills.openingBalances, {});

  // Created after the first run and sold from before the second — so its cache
  // has already moved away from the count it was created with. Opening it at
  // today's 17 would count the sale twice.
  const coke = await aProductAwaitingItsOpeningRow(t, 20);
  await t.mutation(api.sales.create, {
    paymentMethod: "cash",
    items: [{ productId: coke, quantity: 3 }],
  });
  await t.mutation(internal.backfills.openingBalances, {});

  const rows = await movementRowsFor(t, coke);
  expect(rows.filter((m) => m.type === "opening")).toMatchObject([
    { quantity: 20 },
  ]);
  await expectCacheMatchesLedger(t, coke);

  // The opening row explains what came before the sale, so it has to sort
  // before it — even though the backfill that wrote it ran after the sale did.
  const opening = rows.find((m) => m.type === "opening");
  const sale = rows.find((m) => m.type === "sale");
  expect(opening?.createdAt).toBeLessThan(sale?.createdAt ?? Number.NaN);
});

test("the backfill reaches every product row, with no predicate narrowing it", async () => {
  const t = setupTest();
  // Archived and soft-deleted products belong in this list too. Until those
  // fields exist on `products`, "every row in the table" is the whole of that
  // claim — extend this test when they land.
  await aProductAwaitingItsOpeningRow(t, 20);
  await aProductAwaitingItsOpeningRow(t, 0, "Out of stock");
  await aProductAwaitingItsOpeningRow(t, 7, "Pancit Canton");

  const summary = await t.mutation(internal.backfills.openingBalances, {});

  const products = await t.run((ctx) => ctx.db.query("products").collect());
  expect(summary).toMatchObject({ openingRowsWritten: products.length });
  for (const product of products) {
    await expectCacheMatchesLedger(t, product._id);
  }
});
