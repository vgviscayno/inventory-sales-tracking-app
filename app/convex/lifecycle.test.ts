import { describe, expect, test } from "vitest";
import { filterLifecycle, isActive } from "./lifecycle";

describe("isActive", () => {
  test("a row with neither field set is active", () => {
    expect(isActive({})).toBe(true);
  });

  test("an archived row is not active", () => {
    expect(isActive({ archivedAt: 1 })).toBe(false);
  });

  test("a deleted row is not active", () => {
    expect(isActive({ deletedAt: 1 })).toBe(false);
  });
});

describe("filterLifecycle", () => {
  const rows = [
    { name: "active" },
    { name: "archived", archivedAt: 1 },
    { name: "deleted", deletedAt: 1 },
    { name: "archived-and-deleted", archivedAt: 1, deletedAt: 2 },
  ];

  test('"active" keeps only rows with neither field set', () => {
    expect(filterLifecycle(rows, "active").map((r) => r.name)).toEqual([
      "active",
    ]);
  });

  test('"withArchived" keeps active and archived rows, but never deleted ones', () => {
    expect(filterLifecycle(rows, "withArchived").map((r) => r.name)).toEqual([
      "active",
      "archived",
    ]);
  });
});
