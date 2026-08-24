import { expect, test } from "vitest";
import {
  resolveThresholdUnit,
  thresholdInUnits,
  thresholdToBaseUnits,
} from "./lowStockThreshold";

const TRAY = { baseEquivalent: 30 };
const PIECE = { baseEquivalent: 1 };

test("an entry in the threshold's Unit converts to Base units", () => {
  // "Warn me under 5 trays" is 150 pieces.
  expect(thresholdToBaseUnits(5, TRAY)).toBe(150);
  expect(thresholdToBaseUnits(5, PIECE)).toBe(5);
});

test("a fractional entry converts exactly where the Base unit is fine enough", () => {
  expect(thresholdToBaseUnits(0.5, TRAY)).toBe(15);
});

test("an entry finer than one Base unit rounds to a whole Base-unit count", () => {
  // A twentieth of a tray is one and a half pieces. The row holds whole
  // pieces, and half a piece is not a count the shop can act on.
  expect(thresholdToBaseUnits(0.05, TRAY)).toBe(2);
});

// Float multiplication puts 0.1 * 30 at 3.0000000000000004. A stored figure
// that reads back as 0.10000000000000002 is what the rounding prevents.
test("a decimal entry stores without float noise, and reads back as it was typed", () => {
  const stored = thresholdToBaseUnits(0.1, TRAY);
  expect(stored).toBe(3);
  expect(thresholdInUnits(stored, TRAY)).toBe(0.1);
});

test("a stored threshold reads back in the threshold's Unit", () => {
  expect(thresholdInUnits(150, TRAY)).toBe(5);
});

// The point of storing Base units. The stored number stands for the same
// stock whatever Unit reads it afterwards.
test("a change of denominating Unit moves the reading and never the stored stock", () => {
  const stored = thresholdToBaseUnits(5, TRAY);
  expect(thresholdInUnits(stored, PIECE)).toBe(150);
});

/* ── which Unit denominates a threshold ─────────────────────────────────── */

const piece = { label: "piece", baseEquivalent: 1 };
const tray = { label: "tray", baseEquivalent: 30 };
const units = [piece, tray];

test("a threshold that names a Unit is counted in that Unit", () => {
  expect(resolveThresholdUnit(units, "tray", piece)).toBe(tray);
});

// An absent label means "read in the Default unit". There is no backfill.
// Every threshold written before the Unit existed therefore lands here.
test("a threshold that names no Unit falls back to the Default unit", () => {
  expect(resolveThresholdUnit(units, undefined, piece)).toBe(piece);
});

// A removed Unit clears the label. The mutation clears the stored one. This
// is the same rule on the read side. It covers the window before that write
// lands, and any row the mutation never touched.
test("a threshold naming a Unit the product no longer has falls back to the Default unit", () => {
  expect(resolveThresholdUnit(units, "case", piece)).toBe(piece);
});
