import { expect, test } from "vitest";
import {
  draftAfterSave,
  isPickableUnit,
  resolveDraftThresholdUnit,
  thresholdFieldWording,
} from "./lowStockThresholdField";

const TRAY = { baseEquivalent: 30 };
const PIECE = { baseEquivalent: 1 };

test("the wording names the threshold's Unit in the plural", () => {
  // The Unit sits in the sentence, beside the box, and not in the label. She
  // picks it there.
  expect(thresholdFieldWording("tray")).toMatchObject({
    label: "Low-stock threshold override (optional)",
    sentence: "Warn me under",
    unitLabel: "trays",
  });
});

// A Tagalog label does not inflect. See unitLabels.ts.
test("the wording leaves an uncountable label alone", () => {
  expect(thresholdFieldWording("sako").unitLabel).toBe("sako");
});

test("a save that leaves the threshold alone re-denominates the box", () => {
  // "Under 5 trays" is 150 pieces. The save dropped the tray, so the threshold
  // now reads in the piece. The box must read 150, and not the 5 that is still
  // typed in it. A box left reading 5 stays dirty, and the next save of any
  // other field would store 5 pieces.
  expect(draftAfterSave(150, PIECE)).toBe("150");
});

test("a save that leaves both the threshold and its Unit alone leaves the box alone", () => {
  expect(draftAfterSave(150, TRAY)).toBe("5");
});

test("a cleared threshold empties the box, which reads as the shop default", () => {
  expect(draftAfterSave(undefined, TRAY)).toBe("");
});

/* ── the picker over Units that are still being typed ───────────────────── */

const piece = { label: "piece", baseEquivalent: 1 };
const tray = { label: "tray", baseEquivalent: 30 };

test("a Unit is pickable once it has both a name and a size", () => {
  expect(isPickableUnit(tray)).toBe(true);
  // Halfway through typing a row: the name box is empty, and the size box is
  // empty, half-typed, or zero.
  expect(isPickableUnit({ label: "", baseEquivalent: 30 })).toBe(false);
  expect(isPickableUnit({ label: "case", baseEquivalent: Number.NaN })).toBe(
    false,
  );
  expect(isPickableUnit({ label: "case", baseEquivalent: 0 })).toBe(false);
});

test("an unpicked threshold is counted in the Default unit", () => {
  expect(resolveDraftThresholdUnit([piece, tray], "tray", null)).toBe(tray);
});

test("a picked Unit wins over the Default unit", () => {
  expect(resolveDraftThresholdUnit([piece, tray], "piece", "tray")).toBe(tray);
});

// She picked a row and then deleted it. The threshold falls back to the
// Default unit. It does not count nothing. This is the rule for a removed
// Unit, applied to a list she is still typing.
test("a picked Unit that leaves the form falls back to the Default unit", () => {
  expect(resolveDraftThresholdUnit([piece], "piece", "tray")).toBe(piece);
});

test("a half-typed Unit cannot be picked or fallen back to", () => {
  const halfTyped = { label: "case", baseEquivalent: Number.NaN };
  expect(resolveDraftThresholdUnit([piece, halfTyped], "piece", "case")).toBe(
    piece,
  );
});

// The Base unit box is blank for the first keystrokes of a new product, so
// nothing on the form can denominate anything yet. The field renders, and the
// caller shows a dash rather than a Unit.
test("a form with no complete Unit yet resolves to nothing", () => {
  expect(
    resolveDraftThresholdUnit([{ label: "", baseEquivalent: 1 }], "", null),
  ).toBe(null);
});

// A Default unit that is itself half-typed still leaves a usable answer. The
// first complete row stands in, the same way `resolveDefaultUnit` on the
// server falls back to `units[0]`.
test("a half-typed Default unit falls back to the first complete Unit", () => {
  expect(resolveDraftThresholdUnit([piece, tray], "case", null)).toBe(piece);
});
