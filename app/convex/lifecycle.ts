/**
 * The uniform two-state lifecycle: `archivedAt` and `deletedAt`, absent
 * meaning active. This module is the one place that predicate is spelled out
 * — every handler that filters a lifecycle-bearing table calls in here rather
 * than retyping "both fields undefined" in six places. What varies per entity
 * (whether archiving is gated, what unarchiving means) lives in the gates
 * each module writes for itself, not here.
 */

export type Lifecycle = {
  archivedAt?: number;
  deletedAt?: number;
};

export function isActive(doc: Lifecycle): boolean {
  return doc.archivedAt === undefined && doc.deletedAt === undefined;
}

/**
 * `"active"` is every caller's default — a picker, a grid, a search result —
 * so archived rows stop being selectable without any caller having to ask for
 * that explicitly. `"withArchived"` is for the one place that needs archived
 * rows back: the collapsed Archived section. Deleted rows never come back
 * through either value — delete is the next ticket, and nothing in this one
 * writes `deletedAt`, but the filter is already correct for when it does.
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
