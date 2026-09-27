/** `2026-09-14…` → `14.09.2026` (ISO date or datetime; anything else passes through). */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** `14.09 – 27.09.2026`; the year is written once when both ends share it. */
export function formatDateRange(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  if (!from || !to || from.slice(0, 10) === to.slice(0, 10)) return formatDate((from ?? to)!);
  const a = formatDate(from);
  const b = formatDate(to);
  return a.slice(6) === b.slice(6) ? `${a.slice(0, 5)} – ${b}` : `${a} – ${b}`;
}

/** `12:04:31` — wall-clock time of the last recalculation. */
export function formatClock(d: Date): string {
  return d.toTimeString().slice(0, 8);
}
