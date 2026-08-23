import { describe, expect, test } from "vitest";
import {
  type EntryLine,
  formatProductReading,
  readEntryByProduct,
} from "./entryReading";

function line(
  productId: string,
  productName: string,
  unitLabel: string,
  unitQuantity: number,
  baseEquivalentAtEntry: number,
): EntryLine {
  return {
    productId,
    productName,
    unitLabel,
    unitQuantity,
    baseEquivalentAtEntry,
  };
}

// A tray of eggs holds 30 and a tray of tomatoes holds 12. Both fixtures use
// those figures, because the whole rule turns on the two being different.
const EGG_TRAY = 30;
const TOMATO_TRAY = 12;

describe("readEntryByProduct", () => {
  test("gives one reading per product", () => {
    const readings = readEntryByProduct([
      line("eggs_m", "Eggs (Medium)", "tray", 10, EGG_TRAY),
      line("eggs_l", "Eggs (Large)", "tray", 10, EGG_TRAY),
    ]);

    expect(readings.map((r) => r.productName)).toEqual([
      "Eggs (Medium)",
      "Eggs (Large)",
    ]);
    expect(readings.map(formatProductReading)).toEqual([
      "+10 trays",
      "+10 trays",
    ]);
  });

  test("never adds across products that share a Unit label", () => {
    const readings = readEntryByProduct([
      line("eggs_m", "Eggs (Medium)", "tray", 10, EGG_TRAY),
      line("tomatoes", "Tomatoes", "tray", 6, TOMATO_TRAY),
    ]);

    expect(readings).toHaveLength(2);
    expect(readings.map(formatProductReading)).toEqual([
      "+10 trays",
      "+6 trays",
    ]);
  });

  test("merges two Lines of one product in the same Unit", () => {
    const readings = readEntryByProduct([
      line("eggs_m", "Eggs (Medium)", "tray", 10, EGG_TRAY),
      line("eggs_m", "Eggs (Medium)", "tray", 5, EGG_TRAY),
    ]);

    expect(readings).toHaveLength(1);
    expect(formatProductReading(readings[0])).toBe("+15 trays");
  });

  test("keeps two Lines of one product in different Units apart", () => {
    const readings = readEntryByProduct([
      line("eggs_m", "Eggs (Medium)", "tray", -1, EGG_TRAY),
      line("eggs_m", "Eggs (Medium)", "pc", -3, 1),
    ]);

    expect(readings).toHaveLength(1);
    expect(formatProductReading(readings[0])).toBe("-1 tray, -3 pcs");
  });

  // A product whose `tray` was 12 and is now 30 leaves Lines under both. The
  // label alone would merge them and report 16 trays of nothing.
  test("keeps one label apart across two Base equivalents", () => {
    const readings = readEntryByProduct([
      line("eggs_m", "Eggs (Medium)", "tray", 10, EGG_TRAY),
      line("eggs_m", "Eggs (Medium)", "tray", 6, TOMATO_TRAY),
    ]);

    expect(readings).toHaveLength(1);
    expect(formatProductReading(readings[0])).toBe("+10 trays, +6 trays");
  });

  test("inflects each term's label to agree with its own count", () => {
    const readings = readEntryByProduct([
      line("eggs_m", "Eggs (Medium)", "tray", 1, EGG_TRAY),
      line("rice", "Rice", "sako", 2, 25_000),
    ]);

    expect(readings.map(formatProductReading)).toEqual(["+1 tray", "+2 sako"]);
  });

  test("reads no Lines as no readings", () => {
    expect(readEntryByProduct([])).toEqual([]);
  });
});
