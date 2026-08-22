import { describe, expect, test } from "vitest";
import { formatCount, unitLabelFor } from "./unitLabels";

describe("formatCount", () => {
  test("a count of exactly one reads singular", () => {
    expect(formatCount(1, "tray")).toBe("1 tray");
  });

  test("every other count reads plural", () => {
    expect(formatCount(0, "tray")).toBe("0 trays");
    expect(formatCount(2, "tray")).toBe("2 trays");
    expect(formatCount(305, "tray")).toBe("305 trays");
  });

  // Base equivalent's entry in CONTEXT.md permits decimal quantities where the
  // store genuinely sells that way, so these are reachable — and a negative
  // count is the ledger disagreeing with the shelf, which still has to read.
  test("fractions and negatives read plural", () => {
    expect(formatCount(0.5, "tray")).toBe("0.5 trays");
    expect(formatCount(1.5, "tray")).toBe("1.5 trays");
    expect(formatCount(-3, "tray")).toBe("-3 trays");
  });

  // A movement sheet renders a sale as a signed quantity, so one tray leaving
  // arrives here as -1. That is still one tray.
  test("a signed count inflects on its magnitude", () => {
    expect(formatCount(-1, "tray")).toBe("-1 tray");
    expect(formatCount(-2, "tray")).toBe("-2 trays");
  });

  test("irregular English labels inflect properly", () => {
    expect(formatCount(2, "box")).toBe("2 boxes");
    expect(formatCount(2, "case")).toBe("2 cases");
    expect(formatCount(2, "sack")).toBe("2 sacks");
  });
});

describe("uncountable labels", () => {
  // Units of measure are abbreviations, not English nouns — "2 kgs" is wrong.
  test("measure abbreviations never take an s", () => {
    expect(formatCount(2, "kg")).toBe("2 kg");
    expect(formatCount(500, "g")).toBe("500 g");
    expect(formatCount(2, "ml")).toBe("2 ml");
    expect(formatCount(1, "kg")).toBe("1 kg");
  });

  // Tagalog nouns do not inflect for number at all: "3 sako", never "3 sakos".
  test("Tagalog labels never take an s", () => {
    expect(formatCount(3, "sako")).toBe("3 sako");
    expect(formatCount(3, "kaha")).toBe("3 kaha");
    expect(formatCount(3, "tali")).toBe("3 tali");
    expect(formatCount(3, "bilao")).toBe("3 bilao");
  });

  test("the rule holds however she capitalised it", () => {
    expect(formatCount(2, "KG")).toBe("2 KG");
    expect(formatCount(3, "Sako")).toBe("3 Sako");
  });
});

describe("labels that predate this module", () => {
  // Nothing ever asked her for the singular, so a label typed plural is
  // ordinary existing data. `pluralize` inflects both ways, which is what lets
  // the plural be derived rather than stored and migrated.
  test("a label typed plural still reads singular at one", () => {
    expect(formatCount(1, "trays")).toBe("1 tray");
    expect(formatCount(1, "boxes")).toBe("1 box");
    expect(formatCount(3, "trays")).toBe("3 trays");
  });

  test("'pcs' is rewritten to 'pc' at a count of one", () => {
    // Accepted deliberately: deriving the plural means the app owns the
    // wording, and "1 pc" is correct English even though she typed "pcs".
    expect(formatCount(1, "pcs")).toBe("1 pc");
    expect(formatCount(3, "pcs")).toBe("3 pcs");
  });
});

describe("label shapes that are not single English nouns", () => {
  test("a multiword label inflects only its last word", () => {
    expect(formatCount(2, "egg tray")).toBe("2 egg trays");
  });

  test("case is preserved", () => {
    expect(formatCount(2, "Tray")).toBe("2 Trays");
    expect(formatCount(2, "TRAY")).toBe("2 TRAYS");
  });

  test("an empty label does not crash", () => {
    expect(formatCount(2, "")).toBe("2 ");
  });
});

describe("unitLabelFor", () => {
  // Exposed for the callers that lay the count out themselves — the Register's
  // stepper, a signed quantity on a movement sheet.
  test("returns the label alone", () => {
    expect(unitLabelFor(1, "tray")).toBe("tray");
    expect(unitLabelFor(3, "tray")).toBe("trays");
  });

  test("repeated calls agree with the first (the cache is not stale)", () => {
    expect(unitLabelFor(3, "tray")).toBe("trays");
    expect(unitLabelFor(1, "tray")).toBe("tray");
    expect(unitLabelFor(7, "tray")).toBe("trays");
    expect(unitLabelFor(1, "tray")).toBe("tray");
  });
});
