/**
 * How a Ledger row's date and time read on screen.
 *
 * `dayKey` builds an identity and not a date string. Compare two keys for
 * equality alone.
 * `getMonth` counts from zero, so August reads `7`, and no date parser accepts
 * the key. The fields also carry no padding, so `2026-7-5` sorts after
 * `2026-7-15`. The key therefore never sorts either.
 * The Date getters read local time, so a day starts and ends by the tablet's
 * clock. The shop's own day is what groups the Ledger, and not the UTC day.
 */
const DAY = 86_400_000;

/** Calendar-day identity, for grouping the Ledger under date headings. */
export function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function formatDayHeading(at: number, now = Date.now()): string {
  if (dayKey(at) === dayKey(now)) return "Today";
  if (dayKey(at) === dayKey(now - DAY)) return "Yesterday";
  return new Date(at).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
