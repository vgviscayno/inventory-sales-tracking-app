"use client";

// PROTOTYPE ONLY — throwaway, do not ship. Gated below.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: { key: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const index = variants.findIndex((v) => v.key === current);
  const active = variants[index] ?? variants[0];

  function go(nextIndex: number) {
    const wrapped = (nextIndex + variants.length) % variants.length;
    const params = new URLSearchParams(searchParams.toString());
    params.set("variant", variants[wrapped].key);
    router.replace(`?${params.toString()}`);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: go closes over index/variants and is redefined every render; re-running the effect on index change is the intended behavior
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === "ArrowLeft") go(index - 1);
      if (e.key === "ArrowRight") go(index + 1);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [index]);

  if (process.env.NODE_ENV === "production") return null;

  return (
    <div className="fixed bottom-3 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink px-4 py-2 text-bg shadow-[0_6px_20px_rgba(0,0,0,.35)]">
      <button
        type="button"
        onClick={() => go(index - 1)}
        className="px-1 text-lg leading-none"
        aria-label="Previous variant"
      >
        ←
      </button>
      <span className="whitespace-nowrap text-xs font-semibold">
        {active.key} — {active.label}
      </span>
      <button
        type="button"
        onClick={() => go(index + 1)}
        className="px-1 text-lg leading-none"
        aria-label="Next variant"
      >
        →
      </button>
    </div>
  );
}
