"use client";

// PROTOTYPE ONLY — throwaway, resolving:
// INV-18 (Movement history surface) — https://linear.app/inventory-sales-tracking/issue/INV-18
//
// Two variants of a dedicated Movements tab, switchable via ?variant=. Reached
// from a real 4th nav tab (see ../../Nav.tsx — also prototype-only), so the
// question "does this deserve a nav slot?" is judged with the nav as it'd be,
// not a mock. Both reuse the day-grouped windowed list from Variant A.

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { PrototypeSwitcher } from "../../../prototype/PrototypeSwitcher";
import { VariantD } from "./VariantD";
import { VariantE } from "./VariantE";

const VARIANTS = [
  { key: "D", label: "Flat ledger (A's rows, global)" },
  { key: "E", label: "One row per logged entry" },
];

function Prototype() {
  const searchParams = useSearchParams();
  const variant = searchParams.get("variant") ?? "D";

  return (
    <>
      {variant === "D" && <VariantD />}
      {variant === "E" && <VariantE />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </>
  );
}

export default function MovementsTabPrototypePage() {
  return (
    <Suspense fallback={null}>
      <Prototype />
    </Suspense>
  );
}
