import { describe, expect, test } from "vitest";
import {
  buildReadingLadder,
  formatReading,
  formatStock,
  readQuantity,
} from "./remainderReading";

// Eggs: a nesting ladder — a case is twelve trays is 360 pieces. Labels are
// singular, as CONTEXT.md's "Unit" has them; the reading inflects each one
// to agree with its own count.
const EGGS = {
  units: [
    { label: "pc", baseEquivalent: 1 },
    { label: "tray", baseEquivalent: 30 },
    { label: "case", baseEquivalent: 360 },
  ],
  baseUnitLabel: "pc",
};

// Onions: rungs that don't divide into each other — a sack is 8⅓ bundles.
const ONIONS = {
  units: [
    { label: "pc", baseEquivalent: 1 },
    { label: "bundle", baseEquivalent: 12 },
    { label: "sack", baseEquivalent: 100 },
  ],
  baseUnitLabel: "pc",
};

// Rice: a very fine Base unit, used for the ladder that omits it.
const RICE = {
  units: [
    { label: "g", baseEquivalent: 1 },
    { label: "kilo", baseEquivalent: 1000 },
    { label: "sako", baseEquivalent: 25000 },
  ],
  baseUnitLabel: "g",
};

const labels = (ladder: { label: string }[]) => ladder.map((u) => u.label);

describe("buildReadingLadder", () => {
  test("sorts by descending Base equivalent, not by the order they were ticked", () => {
    expect(
      labels(
        buildReadingLadder({ ...EGGS, readingUnitLabels: ["tray", "case"] }),
      ),
    ).toEqual(["case", "tray", "pc"]);
  });

  test("appends the Base unit as the final rung even when it was not selected", () => {
    expect(
      labels(
        buildReadingLadder({ ...RICE, readingUnitLabels: ["sako", "kilo"] }),
      ),
    ).toEqual(["sako", "kilo", "g"]);
  });

  test("an absent or empty selection is the plain Base-unit reading", () => {
    expect(labels(buildReadingLadder(EGGS))).toEqual(["pc"]);
    expect(
      labels(buildReadingLadder({ ...EGGS, readingUnitLabels: [] })),
    ).toEqual(["pc"]);
  });

  describe("a bad selection degrades rather than throwing", () => {
    test("ignores a label whose Unit has since been deleted from the product", () => {
      expect(
        labels(
          buildReadingLadder({
            ...EGGS,
            readingUnitLabels: ["crate", "tray"],
          }),
        ),
      ).toEqual(["tray", "pc"]);
    });

    test("ignores a second Unit sharing a Base equivalent — it would read 0 forever", () => {
      const withTwin = {
        units: [...EGGS.units, { label: "plateau", baseEquivalent: 30 }],
        baseUnitLabel: "pc",
      };
      expect(
        labels(
          buildReadingLadder({
            ...withTwin,
            readingUnitLabels: ["tray", "plateau"],
          }),
        ),
      ).toEqual(["tray", "pc"]);
    });

    test("ignores a selection no coarser than the Base unit", () => {
      expect(
        labels(buildReadingLadder({ ...EGGS, readingUnitLabels: ["pc"] })),
      ).toEqual(["pc"]);
    });

    test("stands the Base unit in even when its label names no Unit", () => {
      expect(
        labels(
          buildReadingLadder({
            units: [{ label: "tray", baseEquivalent: 30 }],
            baseUnitLabel: "pc",
            readingUnitLabels: ["tray"],
          }),
        ),
      ).toEqual(["tray", "pc"]);
    });
  });
});

describe("readQuantity", () => {
  const ladderFor = (
    product: Parameters<typeof buildReadingLadder>[0],
    readingUnitLabels: string[],
  ) => buildReadingLadder({ ...product, readingUnitLabels });

  test("a two-rung ladder reads the way the Default unit used to", () => {
    expect(readQuantity(305, ladderFor(EGGS, ["tray"]))).toEqual([
      { count: 10, unitLabel: "tray" },
      { count: 5, unitLabel: "pc" },
    ]);
  });

  test("a three-rung ladder reads greedily, each rung taking its whole count", () => {
    expect(readQuantity(1085, ladderFor(EGGS, ["case", "tray"]))).toEqual([
      { count: 3, unitLabel: "case" },
      { count: 0, unitLabel: "tray" },
      { count: 5, unitLabel: "pc" },
    ]);
  });

  test("rungs that don't divide into each other still read exactly", () => {
    const terms = readQuantity(437, ladderFor(ONIONS, ["sack", "bundle"]));
    expect(terms).toEqual([
      { count: 4, unitLabel: "sack" },
      { count: 3, unitLabel: "bundle" },
      { count: 1, unitLabel: "pc" },
    ]);
    // The whole point of permitting them: the terms add back to the figure.
    expect(
      4 * 100 + 3 * 12 + 1, // sack, bundle, pc
    ).toBe(437);
  });

  test("a ladder that omits the Base unit still places the finest remainder", () => {
    expect(readQuantity(78400, ladderFor(RICE, ["sako", "kilo"]))).toEqual([
      { count: 3, unitLabel: "sako" },
      { count: 3, unitLabel: "kilo" },
      { count: 400, unitLabel: "g" },
    ]);
  });

  test("a zero remainder", () => {
    expect(readQuantity(300, ladderFor(EGGS, ["tray"]))).toEqual([
      { count: 10, unitLabel: "tray" },
      { count: 0, unitLabel: "pc" },
    ]);
  });

  test("a remainder smaller than the finest selected Unit", () => {
    expect(readQuantity(301, ladderFor(EGGS, ["tray"]))).toEqual([
      { count: 10, unitLabel: "tray" },
      { count: 1, unitLabel: "pc" },
    ]);
  });

  test("a Base amount below one rung", () => {
    expect(readQuantity(5, ladderFor(EGGS, ["tray"]))).toEqual([
      { count: 0, unitLabel: "tray" },
      { count: 5, unitLabel: "pc" },
    ]);
  });

  test("a negative amount reads plain — a recount signal, not a shelf count", () => {
    expect(readQuantity(-5, ladderFor(EGGS, ["case", "tray"]))).toEqual([
      { count: -5, unitLabel: "pc" },
    ]);
  });

  test("the single-Unit degenerate case", () => {
    expect(
      readQuantity(
        305,
        buildReadingLadder({
          units: [{ label: "pc", baseEquivalent: 1 }],
          baseUnitLabel: "pc",
        }),
      ),
    ).toEqual([{ count: 305, unitLabel: "pc" }]);
  });
});

describe("formatReading", () => {
  test("spells every rung that counts, in ladder order", () => {
    expect(
      formatReading([
        { count: 4, unitLabel: "sack" },
        { count: 3, unitLabel: "bundle" },
        { count: 1, unitLabel: "pc" },
      ]),
    ).toBe("4 sacks, 3 bundles, 1 pc");
  });

  test("a rung that counts zero is not spoken", () => {
    expect(
      formatReading([
        { count: 3, unitLabel: "case" },
        { count: 0, unitLabel: "tray" },
        { count: 5, unitLabel: "pc" },
      ]),
    ).toBe("3 cases, 5 pcs");
  });

  test("an all-zero figure falls back to the Base unit", () => {
    expect(
      formatReading([
        { count: 0, unitLabel: "case" },
        { count: 0, unitLabel: "tray" },
        { count: 0, unitLabel: "pc" },
      ]),
    ).toBe("0 pcs");
  });

  test("each term agrees with its own count", () => {
    expect(
      formatReading([
        { count: 1, unitLabel: "tray" },
        { count: 1, unitLabel: "pc" },
      ]),
    ).toBe("1 tray, 1 pc");
    expect(
      formatReading([
        { count: 1, unitLabel: "tray" },
        { count: 5, unitLabel: "pc" },
      ]),
    ).toBe("1 tray, 5 pcs");
  });

  test("plain", () => {
    expect(formatReading([{ count: 305, unitLabel: "pc" }])).toBe("305 pcs");
  });
});

describe("formatStock", () => {
  test("reads a product against its ladder", () => {
    expect(
      formatStock({
        ...EGGS,
        quantityOnHand: 1085,
        readingUnitLabels: ["tray", "case"],
      }),
    ).toBe("3 cases, 5 pcs");
  });

  test("reads plainly with no ladder", () => {
    expect(formatStock({ ...EGGS, quantityOnHand: 1085 })).toBe("1085 pcs");
  });

  test("a ladder of just the Default unit reproduces the two-term reading", () => {
    expect(
      formatStock({
        ...EGGS,
        quantityOnHand: 305,
        readingUnitLabels: ["tray"],
      }),
    ).toBe("10 trays, 5 pcs");
  });
});
