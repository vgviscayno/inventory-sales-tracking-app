const DAY = 86_400_000;

/** Calendar-day identity, for grouping the ledger under date headings. */
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
