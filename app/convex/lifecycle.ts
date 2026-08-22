/**
 * The uniform two-state lifecycle. `archivedAt` and `deletedAt` are both absent
 * on an active row.
 * This module is the one place the predicate is spelled out. Every handler that
 * filters a lifecycle-bearing table calls in here. No handler retypes "both
 * fields undefined" for products, customers, and suppliers.
 * What varies per entity lives in the gates each module writes for itself.
 * Whether Archive is gated, and what Delete may not remove, are two such
 * differences.
 */

export type Lifecycle = {
  archivedAt?: number;
  deletedAt?: number;
};

export function isActive(doc: Lifecycle): boolean {
  return doc.archivedAt === undefined && doc.deletedAt === undefined;
}

/**
 * `"active"` is every caller's default. A picker, a grid, and a search result
 * all take it. An archived row therefore stops being selectable, and no caller
 * asks for that.
 * `"withArchived"` serves the one place that needs archived rows back, the
 * collapsed Archived section.
 * A deleted row never comes back through either value.
 */
export function filterLifecycle<T extends Lifecycle>(
  docs: T[],
  include: "active" | "withArchived",
): T[] {
  if (include === "withArchived") {
    return docs.filter((d) => d.deletedAt === undefined);
  }
  return docs.filter(isActive);
}
