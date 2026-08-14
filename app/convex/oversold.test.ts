import { describe, expect, test } from "vitest";
import { findOversold } from "./oversold";

describe("findOversold", () => {
  test("the empty case: no lines means no oversold products", () => {
    expect(
      findOversold([], [{ productId: "eggs", quantityOnHand: 60 }]),
    ).toEqual([]);
  });

  test("two lines of one product summing past stock", () => {
    expect(
      findOversold(
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
      findOversold(
        [
          { productId: "eggs", delta: -15 },
          { productId: "eggs", delta: 10 },
        ],
        [{ productId: "eggs", quantityOnHand: 10 }],
      ),
    ).toEqual([]);
  });

  test("several products in one call, only the oversold ones come back", () => {
    expect(
      findOversold(
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
    expect(findOversold([{ productId: "deleted", delta: -5 }], [])).toEqual([]);
  });
});
