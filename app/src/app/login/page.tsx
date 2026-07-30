"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });

    setSubmitting(false);
    if (res.ok) {
      router.replace("/");
      router.refresh();
    } else {
      setError("Incorrect passcode");
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-3.5">
        <h1 className="text-center text-xl font-semibold">Enter Passcode</h1>
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
          className="w-full rounded-[10px] border border-line bg-card px-4 py-3 text-center text-lg"
          placeholder="Passcode"
        />
        {error && <p className="text-danger text-center text-sm">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !passcode}
          className="w-full rounded-xl bg-accent py-3.5 font-bold text-accent-ink disabled:bg-[#d6d3d1]"
        >
          {submitting ? "Checking..." : "Enter"}
        </button>
      </form>
    </main>
  );
}
