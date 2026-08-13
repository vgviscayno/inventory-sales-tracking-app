"use client";

import { useState } from "react";

/**
 * The collapsed Archived section a list-page pattern all lives under: shows
 * its count while collapsed, expands to whatever the caller renders for each
 * archived row. Built generic over its content rather than over "products"
 * specifically, since customers and suppliers will want the identical shape
 * once they grow a lifecycle of their own — but nothing here assumes a
 * second caller yet; it just doesn't foreclose one.
 */
export function ArchivedSection({
  count,
  subtitle,
  children,
}: {
  count: number;
  // A line rendered next to the count while the section is collapsed — the
  // seam customers hangs "total still owed" off of, so that debt sums where
  // the row that carries it is one tap away, without products (which have no
  // such total) needing to pass anything.
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="card flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="font-semibold">Archived</span>
        <span className="text-sub text-[13px]">
          {subtitle ? <>{subtitle} · </> : null}
          {count} {open ? "▲" : "▼"}
        </span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}
