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
 * The Movements tab's filter selection, held in localStorage and not in the
 * URL. The nav's links to `/movements` carry no query string. A URL-only
 * filter would therefore reset on every trip through the nav bar, instead of
 * surviving it.
 * The mount effect reads storage, and the initializer does not. The
 * server-rendered markup and the first client render therefore match before
 * anything consults localStorage.
 *
 * Only the setters below write to storage, at the moment somebody changes
 * something. No effect watches the state and writes it.
 * A blanket `useEffect(() => write(state), [state])` would also fire right
 * after the mount effect hydrates from storage. It closes over the state from
 * before that hydration, which is the default. It would therefore clobber
 * whatever the same mount just read, and put the defaults back.
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
