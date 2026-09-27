/**
 * SOF summary figures (laytime-style totals) over the event log.
 *
 * Pure and deterministic: no Date.now(), no locale. Times are minutes within
 * the event's own day (`24:00` = 1440, end of day, per TZ §8 rule 5).
 */
import { timeToMinutes, type IntervalEvent } from './time';

export type SofGroup = 'loading' | 'discharging' | 'weather' | 'port' | 'other';

/** Display order of the groups (legend, timeline). */
export const SOF_GROUPS: readonly SofGroup[] = ['loading', 'discharging', 'weather', 'port', 'other'];

const GROUP_BY_CATEGORY: Readonly<Record<string, SofGroup>> = {
  loading_commenced: 'loading',
  loading_completed: 'loading',
  discharging_commenced: 'discharging',
  discharging_completed: 'discharging',
  weather: 'weather',
  arrival: 'port',
  nor_tendered: 'port',
  nor_accepted: 'port',
  berthed: 'port',
  shifting: 'port',
  waiting: 'port',
  formalities: 'port',
  cast_off: 'port',
  departure: 'port',
};

/** Category key of `SOF_CATEGORIES` → group; unknown and empty categories are `other`. */
export function categoryGroup(category: string | null): SofGroup {
  return (category && GROUP_BY_CATEGORY[category]) || 'other';
}

export interface SofLikeEvent extends IntervalEvent {
  category: string | null;
}

export interface DayInterval {
  from: number;
  to: number;
}

/** `[from, to)` in minutes when both ends are set, otherwise null. */
export function eventInterval(e: IntervalEvent): DayInterval | null {
  const from = timeToMinutes(e.time_from);
  const to = timeToMinutes(e.time_to);
  if (from === null || to === null) return null;
  return { from, to };
}

export function durationMinutes(e: IntervalEvent): number | null {
  const iv = eventInterval(e);
  return iv ? iv.to - iv.from : null;
}

/**
 * Minutes covered by the events, overlaps counted once: intervals are merged
 * per day before summing, so two overlapping loading entries do not double
 * the working time.
 */
export function coveredMinutes(events: readonly IntervalEvent[]): number {
  const byDay = new Map<string, DayInterval[]>();
  for (const e of events) {
    const iv = eventInterval(e);
    if (!iv || iv.to <= iv.from) continue;
    const list = byDay.get(e.event_date) ?? [];
    list.push(iv);
    byDay.set(e.event_date, list);
  }
  let total = 0;
  for (const list of byDay.values()) {
    list.sort((a, b) => a.from - b.from || a.to - b.to);
    let curFrom = list[0]!.from;
    let curTo = list[0]!.to;
    for (let i = 1; i < list.length; i++) {
      const iv = list[i]!;
      if (iv.from <= curTo) {
        curTo = Math.max(curTo, iv.to);
      } else {
        total += curTo - curFrom;
        curFrom = iv.from;
        curTo = iv.to;
      }
    }
    total += curTo - curFrom;
  }
  return total;
}

/** Covered minutes of the events whose category falls into one of `groups`. */
export function groupMinutes(events: readonly SofLikeEvent[], groups: readonly SofGroup[]): number {
  return coveredMinutes(events.filter((e) => groups.includes(categoryGroup(e.category))));
}

export interface OverlapPair {
  /** Indices into the input list, `a < b`. */
  a: number;
  b: number;
}

/**
 * Every pair of same-day events whose `[from, to)` intervals intersect —
 * the same rule as `findOverlapping`, kept as pairs so the UI can name them.
 */
export function findOverlapPairs(events: readonly IntervalEvent[]): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  const intervals = events.map(eventInterval);
  for (let a = 0; a < events.length; a++) {
    const ia = intervals[a];
    if (!ia) continue;
    for (let b = a + 1; b < events.length; b++) {
      const ib = intervals[b];
      if (!ib || events[a]!.event_date !== events[b]!.event_date) continue;
      if (ia.from < ib.to && ib.from < ia.to) pairs.push({ a, b });
    }
  }
  return pairs;
}

/** Distinct event dates, ascending (ISO strings sort chronologically). */
export function eventDays(events: readonly IntervalEvent[]): string[] {
  return Array.from(new Set(events.map((e) => e.event_date))).sort();
}

function isoToUtcDays(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!) / 86_400_000;
}

/** Calendar days from `from` to `to` inclusive (`2026-09-22`..`2026-09-27` → 6). */
export function calendarSpanDays(from: string, to: string): number {
  return isoToUtcDays(to) - isoToUtcDays(from) + 1;
}

/** 0 = Sunday … 6 = Saturday, computed in UTC so the local zone cannot shift it. */
export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** `1985` → `33:05`. Hours are not wrapped at 24: a total may span several days. */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface SofSummary {
  eventCount: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Calendar days from the first to the last event date, inclusive. */
  spanDays: number;
  /** Loading ∪ discharging, overlaps counted once. */
  workingMinutes: number;
  weatherMinutes: number;
  weatherEventCount: number;
  overlapPairs: OverlapPair[];
}

export function summarizeSof(events: readonly SofLikeEvent[]): SofSummary {
  const days = eventDays(events);
  const firstDate = days[0] ?? null;
  const lastDate = days[days.length - 1] ?? null;
  return {
    eventCount: events.length,
    firstDate,
    lastDate,
    spanDays: firstDate && lastDate ? calendarSpanDays(firstDate, lastDate) : 0,
    workingMinutes: groupMinutes(events, ['loading', 'discharging']),
    weatherMinutes: groupMinutes(events, ['weather']),
    weatherEventCount: events.filter((e) => categoryGroup(e.category) === 'weather').length,
    overlapPairs: findOverlapPairs(events),
  };
}
