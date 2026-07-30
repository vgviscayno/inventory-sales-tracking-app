"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Register" },
  { href: "/products", label: "Products" },
  { href: "/customers", label: "Customers" },
];

export function Nav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  return (
    <nav className="sticky top-0 z-10 flex gap-2 bg-bg px-3.5 pt-2.5">
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 rounded-xl py-2.5 text-center text-sm font-semibold ${
              active ? "bg-accent text-accent-ink" : "card text-ink"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
