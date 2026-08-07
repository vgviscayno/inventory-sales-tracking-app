"use client";

import { useEffect, useState } from "react";

export type TypeFilter = "all" | "deliveries" | "pullouts";

const STORAGE_KEY = "movements.filter";

type Stored = { typeFilter: TypeFilter; includeSales: boolean };

function isTypeFilter(value: unknown): value is TypeFilter {
  return value === "all" || value === "deliveries" || value === "pullouts";
}

function readStored(): Stored | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { typeFilter, includeSales } = parsed as Record<string, unknown>;
    if (!isTypeFilter(typeFilter) || typeof includeSales !== "boolean") {
      return null;
    }
    return { typeFilter, includeSales };
  } catch {
    return null;
  }
}

const DEFAULT: Stored = { typeFilter: "all", includeSales: false };

/**
 * The Movements tab's filter selection, kept in localStorage rather than the
 * URL: the nav's links to `/movements` carry no query string, so a URL-only
 * filter would reset on every trip through the nav bar rather than surviving
 * it. Read lazily on mount (not in the initializer) so server-rendered and
 * first-client-render markup match before localStorage is consulted.
 *
 * Storage is written only from the setters below, at the moment the user
 * changes something — never from an effect watching the state. A blanket
 * `useEffect(() => write(state), [state])` would also fire right after the
 * mount effect hydrates from storage, and it closes over the pre-hydration
 * (default) state, so it would clobber whatever this same mount just read
 * back to the defaults.
 */
export function useMovementsFilter() {
  const [state, setState] = useState<Stored>(DEFAULT);

  useEffect(() => {
    const stored = readStored();
    if (stored) setState(stored);
  }, []);

  function persist(next: Stored) {
    setState(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return {
    typeFilter: state.typeFilter,
    setTypeFilter: (typeFilter: TypeFilter) =>
      persist({ ...state, typeFilter }),
    includeSales: state.includeSales,
    setIncludeSales: (includeSales: boolean) =>
      persist({ ...state, includeSales }),
  };
}
