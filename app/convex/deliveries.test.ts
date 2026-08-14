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
  const coke = await aProductHolding(t, 20);

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

test("deliveries list newest first, each carrying its lines and net change", async () => {
  const t = setupTest();
  const coke = await aProductHolding(t, 20, { name: "Coke 1.5L" });
  const pancit = await aProductHolding(t, 10, {
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
