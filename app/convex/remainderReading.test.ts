import { describe, expect, test } from "vitest";
import {
  formatQuantityReading,
  formatStock,
  readQuantity,
} from "./remainderReading";

const TRAY = { label: "tray", baseEquivalent: 30 };

describe("readQuantity", () => {
  test("a clean decomposition", () => {
    expect(readQuantity(305, "pcs", TRAY, true)).toEqual({
      decomposed: true,
      whole: 10,
      wholeUnitLabel: "tray",
      remainder: 5,
      remainderUnitLabel: "pcs",
    });
  });

  test("a zero remainder", () => {
    expect(readQuantity(300, "pcs", TRAY, true)).toEqual({
      decomposed: true,
      whole: 10,
      wholeUnitLabel: "tray",
      remainder: 0,
      remainderUnitLabel: "pcs",
    });
  });

  test("a remainder smaller than one Default unit", () => {
    expect(readQuantity(301, "pcs", TRAY, true)).toEqual({
      decomposed: true,
      whole: 10,
      wholeUnitLabel: "tray",
      remainder: 1,
      remainderUnitLabel: "pcs",
    });
  });

  test("a Base amount below one Default unit", () => {
    expect(readQuantity(5, "pcs", TRAY, true)).toEqual({
      decomposed: true,
      whole: 0,
      wholeUnitLabel: "tray",
      remainder: 5,
      remainderUnitLabel: "pcs",
    });
  });

  test("a negative amount reads plain — a recount signal, not a shelf count", () => {
    expect(readQuantity(-5, "pcs", TRAY, true)).toEqual({
      decomposed: false,
      amount: -5,
      unitLabel: "pcs",
    });
  });

  test("the single-Unit degenerate case: Default unit is the Base unit", () => {
    expect(
      readQuantity(305, "pcs", { label: "pcs", baseEquivalent: 1 }, true),
    ).toEqual({ decomposed: false, amount: 305, unitLabel: "pcs" });
  });

  test("the toggle off reads plain regardless of the Default unit", () => {
    expect(readQuantity(305, "pcs", TRAY, false)).toEqual({
      decomposed: false,
      amount: 305,
      unitLabel: "pcs",
    });
    expect(readQuantity(305, "pcs", TRAY, undefined)).toEqual({
      decomposed: false,
      amount: 305,
      unitLabel: "pcs",
    });
  });
});

describe("formatQuantityReading", () => {
  test("plain", () => {
    expect(
      formatQuantityReading({
        decomposed: false,
        amount: 305,
        unitLabel: "pcs",
      }),
    ).toBe("305 pcs");
  });

  test("both terms", () => {
    expect(
      formatQuantityReading({
        decomposed: true,
        whole: 10,
        wholeUnitLabel: "tray",
        remainder: 5,
        remainderUnitLabel: "pcs",
      }),
    ).toBe("10 tray, 5 pcs");
  });

  test("drops a zero remainder", () => {
    expect(
      formatQuantityReading({
        decomposed: true,
        whole: 10,
        wholeUnitLabel: "tray",
        remainder: 0,
        remainderUnitLabel: "pcs",
      }),
    ).toBe("10 tray");
  });

  test("drops a zero whole count", () => {
    expect(
      formatQuantityReading({
        decomposed: true,
        whole: 0,
        wholeUnitLabel: "tray",
        remainder: 5,
        remainderUnitLabel: "pcs",
      }),
    ).toBe("5 pcs");
  });
});

describe("formatStock", () => {
  test("reads a product straight through, enabled", () => {
    expect(
      formatStock({
        quantityOnHand: 305,
        baseUnitLabel: "pcs",
        defaultUnit: TRAY,
        remainderReadingEnabled: true,
      }),
    ).toBe("10 tray, 5 pcs");
  });

  test("reads a product straight through, disabled", () => {
    expect(
      formatStock({
        quantityOnHand: 305,
        baseUnitLabel: "pcs",
        defaultUnit: TRAY,
        remainderReadingEnabled: false,
      }),
    ).toBe("305 pcs");
  });
});
