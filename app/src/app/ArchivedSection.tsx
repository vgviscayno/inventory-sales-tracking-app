"use client";

import { useState } from "react";

/**
 * The collapsed Archived section that every list page uses. It shows its count
 * while collapsed, and it expands to whatever the caller renders for each
 * archived row.
 * The component is generic over its content, and not specific to products.
 * Products, customers, and suppliers each render their own rows through it, and
 * each carries a lifecycle of its own.
 */
export function ArchivedSection({
  count,
  subtitle,
  children,
}: {
  count: number;
  // A line the section renders next to the count while collapsed. Customers
  // hangs its total still owed off this seam. That total therefore sums where
  // the row that carries it is one tap away. Products and suppliers have no
  // such total, and pass nothing.
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
