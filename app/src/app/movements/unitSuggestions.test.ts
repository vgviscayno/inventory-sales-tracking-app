import { describe, expect, test } from "vitest";
import { rankLabels, unitSuggestions } from "./unitSuggestions";

describe("rankLabels", () => {
  test("puts the commonest label first", () => {
    expect(rankLabels(["pc", "sack", "sack", "pc", "sack"])).toEqual([
      "sack",
      "pc",
    ]);
  });

  // `piece` and `Piece` are two rows in the catalog and one Unit to a reader.
  test("groups two spellings of one label into one suggestion", () => {
    expect(rankLabels(["piece", "Piece", "piece", "tray"])).toEqual([
      "piece",
      "tray",
    ]);
  });

  test("offers the commonest spelling of a group", () => {
    expect(rankLabels(["Piece", "Piece", "piece"])).toEqual(["Piece"]);
  });

  // Two labels of one count would otherwise change places between renders.
  // The tie-break settles two spellings of one label as well, and it picks the
  // lower-cased one. Which spelling wins matters less than that it holds.
  test("breaks a tie alphabetically", () => {
    expect(rankLabels(["tray", "kilo"])).toEqual(["kilo", "tray"]);
    expect(rankLabels(["Piece", "piece"])).toEqual(["piece"]);
  });

  test("drops a label that is blank or only spaces", () => {
    expect(rankLabels(["", "  ", "pc"])).toEqual(["pc"]);
  });
});

describe("unitSuggestions", () => {
  // A tray belongs on the second-Unit field and nowhere near the Base unit
  // field. See docs/adr/0004-base-unit-locked.md.
  test("offers only Base units for the Base unit, and every label beside it", () => {
    const catalog = [
      {
        baseUnitLabel: "piece",
        units: [{ label: "piece" }, { label: "tray" }],
      },
      { baseUnitLabel: "sack", units: [{ label: "sack" }] },
    ];

    expect(unitSuggestions(catalog)).toEqual({
      baseUnits: ["piece", "sack"],
      allUnits: ["piece", "sack", "tray"],
    });
  });

  test("gives two empty lists for an empty catalog", () => {
    expect(unitSuggestions([])).toEqual({ baseUnits: [], allUnits: [] });
  });
});
