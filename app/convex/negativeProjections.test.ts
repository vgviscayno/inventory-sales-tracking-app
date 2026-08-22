import { describe, expect, test } from "vitest";
import { findNegativeProjections } from "./negativeProjections";

describe("findNegativeProjections", () => {
  test("the empty case: no lines means no negative projections", () => {
    expect(
      findNegativeProjections([], [{ productId: "eggs", quantityOnHand: 60 }]),
    ).toEqual([]);
  });

  test("two lines of one product summing past stock", () => {
    expect(
      findNegativeProjections(
        [
          { productId: "eggs", delta: -40 },
          { productId: "eggs", delta: -25 },
        ],
        [{ productId: "eggs", quantityOnHand: 60 }],
      ),
    ).toEqual([{ productId: "eggs", quantityOnHand: 60, projected: -5 }]);
  });

  test("two lines individually over but netted fine", () => {
    expect(
      findNegativeProjections(
        [
          { productId: "eggs", delta: -15 },
          { productId: "eggs", delta: 10 },
        ],
        [{ productId: "eggs", quantityOnHand: 10 }],
      ),
    ).toEqual([]);
  });

  test("several products in one call, only the negative projections come back", () => {
    expect(
      findNegativeProjections(
        [
          { productId: "eggs", delta: -5 },
          { productId: "milk", delta: -20 },
          { productId: "bread", delta: -3 },
        ],
        [
          { productId: "eggs", quantityOnHand: 10 },
          { productId: "milk", quantityOnHand: 12 },
          { productId: "bread", quantityOnHand: 3 },
        ],
      ),
    ).toEqual([{ productId: "milk", quantityOnHand: 12, projected: -8 }]);
  });

  test("a product with no matching count is skipped, not treated as zero", () => {
    expect(
      findNegativeProjections([{ productId: "deleted", delta: -5 }], []),
    ).toEqual([]);
  });
});
