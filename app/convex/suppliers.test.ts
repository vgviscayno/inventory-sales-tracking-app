import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { aSupplier, setupTest } from "./test.helpers";

test("creating a supplier with just a name", async () => {
  const t = setupTest();
  const supplierId = await aSupplier(t, "Mang Kanor Trading");

  expect(await t.query(api.suppliers.get, { id: supplierId })).toMatchObject({
    name: "Mang Kanor Trading",
  });
});

test("archiving a supplier removes them from the default list but leaves get and withArchived able to find them", async () => {
  const t = setupTest();
  const supplierId = await aSupplier(t, "Seasonal Supplier");

  await t.mutation(api.suppliers.archive, { id: supplierId });

  expect(await t.query(api.suppliers.list, {})).toEqual([]);
  expect(
    await t.query(api.suppliers.list, { include: "withArchived" }),
  ).toMatchObject([{ _id: supplierId, name: "Seasonal Supplier" }]);
  expect(await t.query(api.suppliers.get, { id: supplierId })).toMatchObject({
    name: "Seasonal Supplier",
    archivedAt: expect.any(Number),
  });
});

test("deleting an archived supplier soft-deletes them and hides them from every list, but leaves get able to find them", async () => {
  const t = setupTest();
  const supplierId = await aSupplier(t, "Typo Supplier");
  await t.mutation(api.suppliers.archive, { id: supplierId });

  await t.mutation(api.suppliers.remove, { id: supplierId });

  expect(await t.query(api.suppliers.list, {})).toEqual([]);
  expect(
    await t.query(api.suppliers.list, { include: "withArchived" }),
  ).toEqual([]);
  expect(await t.query(api.suppliers.get, { id: supplierId })).toMatchObject({
    name: "Typo Supplier",
    deletedAt: expect.any(Number),
  });
});

test("deleting a supplier that isn't archived is refused", async () => {
  const t = setupTest();
  const supplierId = await aSupplier(t);

  await expect(
    t.mutation(api.suppliers.remove, { id: supplierId }),
  ).rejects.toThrow("Only an archived supplier can be deleted");

  expect(
    (await t.query(api.suppliers.get, { id: supplierId }))?.deletedAt,
  ).toBe(undefined);
});

// Unlike a customer, a supplier carries no balance or other second
// condition — archive-first is the whole gate.
test("deleting an archived supplier with no other history succeeds outright", async () => {
  const t = setupTest();
  const supplierId = await aSupplier(t, "One-Off Supplier");
  await t.mutation(api.suppliers.archive, { id: supplierId });

  await expect(
    t.mutation(api.suppliers.remove, { id: supplierId }),
  ).resolves.not.toThrow();
});
