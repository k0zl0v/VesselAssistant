/**
 * SOF time helpers.
 *
 * Times are stored as `HH:MM` text (24-hour). The special value `24:00`
 * is accepted as end-of-day per TZ §8 rule 5 — never as start-of-event.
 */

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

export function timeToMinutes(t: string | null): number | null {
  if (t === null || t === '') return null;
  const m = t.match(TIME_RE);
  if (!m) throw new Error(`Invalid time format: "${t}"`);
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (mm < 0 || mm > 59) throw new Error(`Invalid minutes in "${t}"`);
  if (h < 0 || h > 24) throw new Error(`Invalid hours in "${t}"`);
  if (h === 24 && mm !== 0) {
    throw new Error(`24:xx is only allowed as 24:00 (end of day): "${t}"`);
  }
  return h * 60 + mm;
}

/** Pad to HH:MM (zero-padded hours so lexicographic sort works). */
export function normalizeTime(t: string | null): string | null {
  if (t === null || t === '') return null;
  const minutes = timeToMinutes(t);
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export interface IntervalEvent {
  event_date: string;
  time_from: string | null;
  time_to: string | null;
}

/**
 * Indices of events that overlap with at least one other event on the
 * same date. Open-interval semantics: [from, to). Events without both
 * time_from and time_to are ignored. Order-independent — useful for
 * UI highlighting (TZ §8 rule 4: warn, don't block).
 */
export function findOverlapping(events: IntervalEvent[]): Set<number> {
  const overlapping = new Set<number>();
  for (let i = 0; i < events.length; i++) {
    const a = events[i]!;
    const aFrom = timeToMinutes(a.time_from);
    const aTo = timeToMinutes(a.time_to);
    if (aFrom === null || aTo === null) continue;
    for (let j = i + 1; j < events.length; j++) {
      const b = events[j]!;
      if (a.event_date !== b.event_date) continue;
      const bFrom = timeToMinutes(b.time_from);
      const bTo = timeToMinutes(b.time_to);
      if (bFrom === null || bTo === null) continue;
      if (aFrom < bTo && bFrom < aTo) {
        overlapping.add(i);
        overlapping.add(j);
      }
    }
  }
  return overlapping;
}
