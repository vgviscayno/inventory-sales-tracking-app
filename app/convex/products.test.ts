import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { aProductHolding, setupTest } from "./test.helpers";

test("a product created through the mutation reads back through the query", async () => {
  const t = setupTest();

  const id = await aProductHolding(t, 24, {
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
    quantityOnHand: 24,
    lowStockStatus: "ok",
  });
});
