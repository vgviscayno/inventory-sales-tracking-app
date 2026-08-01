import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { setupTest } from "./test.helpers";

test("a product created through the mutation reads back through the query", async () => {
  const t = setupTest();

  const id = await t.mutation(api.products.create, {
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
    quantityOnHand: 24,
  });

  expect(await t.query(api.products.get, { id })).toMatchObject({
    name: "Lucky Me Pancit Canton",
    sellingPrice: 15,
    quantityOnHand: 24,
    lowStockStatus: "ok",
  });
});
