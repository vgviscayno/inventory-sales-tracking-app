// This file is not a `*.test.ts` file. It calls `import.meta.glob` below, which
// is the only reason the directive is ever needed.
/// <reference types="vite/client" />

import type { Infer } from "convex/values";
import { convexTest } from "convex-test";
import { expect } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema, { type unitValidator } from "./schema";
import { deriveBaseAmount } from "./stockMovements";

// The Convex bundler leaves test files and this helper module out of the
// deployed function set. This filter applies the same rule, because vite's glob
// has no working extglob. convex-test therefore loads the real functions and
// nothing else.
const isTestModule = (path: string) =>
  /\.test\.\w+$/.test(path) || /(^|\/)test\.helpers\.\w+$/.test(path);

const modules = Object.fromEntries(
  Object.entries(import.meta.glob("./**/*.*s")).filter(
    ([path]) => !isTestModule(path),
  ),
);

/** A fresh in-memory deployment, seeded with nothing. */
export function setupTest() {
  return convexTest(schema, modules);
}

export type TestConvex = ReturnType<typeof setupTest>;

type UnitOverride = Infer<typeof unitValidator>;

/**
 * A product created through the public mutation, holding `quantityOnHand`. The
 * fixture stocks it the only way production stocks one, by logging a Delivery
 * for it. The product therefore satisfies `expectCacheMatchesLedger` from
 * birth.
 * `quantityOnHand` is positional because it is the point of the fixture.
 * `overrides` covers everything else.
 *
 * The Delivery is denominated in the product's Base unit. The count asked for
 * is therefore the count arrived at, whatever the other Units say.
 * A holding of zero logs nothing. A Delivery Line must be positive, and a
 * product born at zero with an empty Ledger already reconciles.
 *
 * The fixture defaults to a single Unit, "pc". Existing tests therefore stay
 * short and keep passing `sellingPrice` as a flat number. A test that needs
 * more than one Unit passes `units`. It also passes `baseUnitLabel` when the
 * Base unit is not the first Unit. A tray of eggs alongside the piece is one
 * such test.
 */
export async function aProductHolding(
  t: TestConvex,
  quantityOnHand: number,
  overrides: {
    name?: string;
    sellingPrice?: number;
    units?: UnitOverride[];
    baseUnitLabel?: string;
  } = {},
) {
  const { name, sellingPrice, units, baseUnitLabel } = overrides;
  const resolvedUnits = units ?? [
    { label: "pc", baseEquivalent: 1, price: sellingPrice ?? 75 },
  ];
  const productId = await t.mutation(api.products.create, {
    name: name ?? "Coke 1.5L",
    units: resolvedUnits,
    baseUnitLabel: baseUnitLabel ?? resolvedUnits[0].label,
  });

  if (quantityOnHand !== 0) {
    await t.mutation(api.deliveries.create, {
      lines: [{ kind: "existing", productId, quantity: quantityOnHand }],
    });
  }

  return productId;
}

/** A customer created through the public mutation, owing nothing yet. */
export async function aCustomer(t: TestConvex, name = "Aling Nena") {
  return await t.mutation(api.customers.create, { name });
}

/** A supplier created through the public mutation. */
export async function aSupplier(t: TestConvex, name = "Mang Kanor Trading") {
  return await t.mutation(api.suppliers.create, { name });
}

/**
 * The invariant this whole feature exists to protect. A product's cached
 * `quantityOnHand` is the sum of its `stockMovements` rows, and never a number
 * anyone typed. Call this after any sequence of Ledger writes.
 */
export async function expectCacheMatchesLedger(
  t: TestConvex,
  productId: Id<"products">,
) {
  const product = await t.query(api.products.get, { id: productId });
  if (!product) throw new Error(`No product with id ${productId}`);

  // This assertion reads the Ledger raw, and does so deliberately. Its whole
  // job is to check the cache against the rows themselves. A query that derives
  // anything would weaken it.
  // The product side goes through the public query, which is where drift shows.
  // `deriveBaseAmount` is a pure formula and not a read, so the fold through it
  // weakens nothing.
  const movements = await t.run(async (ctx) =>
    ctx.db
      .query("stockMovements")
      .withIndex("by_product", (q) => q.eq("productId", productId))
      .collect(),
  );

  expect(
    product.quantityOnHand,
    `cached quantityOnHand for "${product.name}" should equal its ledger sum`,
  ).toBe(movements.reduce((sum, m) => sum + deriveBaseAmount(m), 0));
}
