import { describe, expect, test } from "vitest";
import {
  countedIn,
  emptyDraft,
  extraUnitComplete,
  isComplete,
  type NewProductDraft,
  toCreateLine,
} from "./newProductLine";

// The eggs case throughout: a product based in the piece, received by the
// tray. A tray holds 30, which is the figure every Base equivalence below
// turns on.
function eggs(overrides: Partial<NewProductDraft> = {}): NewProductDraft {
  return {
    ...emptyDraft("Eggs Medium"),
    unitLabel: "piece",
    price: "8",
    quantity: 10,
    extraUnitOpen: true,
    extraLabel: "tray",
    extraEquivalent: "30",
    recordIn: "extra",
    ...overrides,
  };
}

describe("isComplete", () => {
  test("a fresh draft is not complete", () => {
    expect(isComplete(emptyDraft("Eggs Medium"))).toBe(false);
  });

  test("a name, a Base unit, and a price are enough", () => {
    const draft = {
      ...emptyDraft("Eggs Medium"),
      unitLabel: "piece",
      price: "8",
    };
    expect(isComplete(draft)).toBe(true);
  });

  test("a product with no name cannot be added", () => {
    expect(isComplete(eggs({ name: "   " }))).toBe(false);
  });

  test("a price of zero is no price", () => {
    expect(isComplete(eggs({ price: "0" }))).toBe(false);
  });

  // The block is open, so the shopkeeper is part-way through a second Unit.
  // The save waits for it rather than dropping it.
  test("a second Unit left half-typed holds the save", () => {
    expect(isComplete(eggs({ extraEquivalent: "" }))).toBe(false);
    expect(isComplete(eggs({ extraLabel: " " }))).toBe(false);
  });

  // The server takes a whole Base equivalent, so the client refuses a
  // fractional one here. See `validateUnits` in convex/products.ts.
  test("a second Unit worth a fraction of a Base unit holds the save", () => {
    expect(isComplete(eggs({ extraEquivalent: "0.5" }))).toBe(false);
  });

  // A blank price box is a Unit with no price of its own. A typed zero is a
  // price the server refuses, so it holds the save instead.
  test("a second-Unit price of zero holds the save", () => {
    expect(isComplete(eggs({ extraPrice: "0" }))).toBe(false);
    expect(isComplete(eggs({ extraPrice: "  " }))).toBe(true);
  });

  test("a second Unit nobody opened does not hold the save", () => {
    const draft = eggs({
      extraUnitOpen: false,
      extraLabel: "",
      extraEquivalent: "",
      recordIn: "base",
    });
    expect(extraUnitComplete(draft)).toBe(false);
    expect(isComplete(draft)).toBe(true);
  });
});

describe("countedIn", () => {
  test("names the second Unit where the draft records in it", () => {
    expect(countedIn(eggs())).toBe("tray");
  });

  test("names the Base unit where the draft records in it", () => {
    expect(countedIn(eggs({ recordIn: "base" }))).toBe("piece");
  });

  // A count in a Unit that is not finished is a count in nothing. The Base
  // unit is the only Unit the product certainly has.
  test("falls back to the Base unit where the second Unit is unfinished", () => {
    expect(countedIn(eggs({ extraEquivalent: "0" }))).toBe("piece");
  });
});

describe("toCreateLine", () => {
  test("carries the second Unit and counts the quantity in it", () => {
    expect(toCreateLine(eggs({ extraPrice: "220" }))).toEqual({
      kind: "new",
      name: "Eggs Medium",
      unitLabel: "piece",
      price: 8,
      extraUnits: [{ label: "tray", baseEquivalent: 30, price: 220 }],
      quantityUnitLabel: "tray",
      quantity: 10,
    });
  });

  // The server prices a Unit with no price of its own from the Base unit.
  test("leaves an untyped second-Unit price for the server to fill", () => {
    expect(toCreateLine(eggs()).extraUnits).toEqual([
      { label: "tray", baseEquivalent: 30, price: undefined },
    ]);
  });

  test("reads a blank price box as no price of its own", () => {
    expect(toCreateLine(eggs({ extraPrice: "   " })).extraUnits).toEqual([
      { label: "tray", baseEquivalent: 30, price: undefined },
    ]);
  });

  test("sends no second Unit where the draft declares none", () => {
    const line = toCreateLine(
      eggs({ extraUnitOpen: false, extraLabel: "", extraEquivalent: "" }),
    );
    expect(line.extraUnits).toBeUndefined();
    expect(line.quantityUnitLabel).toBe("piece");
  });

  test("trims what somebody typed", () => {
    const line = toCreateLine(
      eggs({
        name: " Eggs Medium ",
        unitLabel: " piece ",
        extraLabel: " tray ",
      }),
    );
    expect(line).toMatchObject({ name: "Eggs Medium", unitLabel: "piece" });
    expect(line.extraUnits?.[0].label).toBe("tray");
  });
});
