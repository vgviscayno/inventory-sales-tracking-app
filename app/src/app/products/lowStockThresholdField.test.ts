import { expect, test } from "vitest";
import {
  draftAfterSave,
  thresholdFieldWording,
} from "./lowStockThresholdField";

const TRAY = { baseEquivalent: 30 };
const PIECE = { baseEquivalent: 1 };

test("the wording names the Default unit in the plural", () => {
  expect(thresholdFieldWording("tray")).toEqual({
    label: "Low-stock threshold override, in trays (optional)",
    placeholder: "Uses the shop default, in trays",
  });
});

// A Tagalog label does not inflect. See unitLabels.ts.
test("the wording leaves an uncountable label alone", () => {
  expect(thresholdFieldWording("sako").label).toContain("in sako ");
});

test("a save that leaves the threshold alone re-denominates the box", () => {
  // "Under 5 trays" is 150 pieces. The save moved the Default unit to the
  // piece and never touched the box. The box must now read 150, and not the 5
  // that is still typed in it. A box left reading 5 stays dirty, and the next
  // save of any other field would store 5 pieces.
  expect(draftAfterSave(150, PIECE)).toBe("150");
});

test("a save that leaves both the threshold and the Default unit alone leaves the box alone", () => {
  expect(draftAfterSave(150, TRAY)).toBe("5");
});

test("a cleared threshold empties the box, which reads as the shop default", () => {
  expect(draftAfterSave(undefined, TRAY)).toBe("");
});
