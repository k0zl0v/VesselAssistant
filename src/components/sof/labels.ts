import { categoryGroup, weekdayOf, type SofGroup } from '../../calc/laytime';
import { t, type StringKey } from '../../i18n';
import type { SofEvent } from '../../services/SofService';
import { SOF_CATEGORIES } from '../../services/sofCategories';
import { formatDate } from '../../shell/format';

/** Localised category name; a key outside SOF_CATEGORIES is shown as stored. */
export function categoryLabel(key: string | null): string {
  if (!key) return '—';
  return SOF_CATEGORIES.some((c) => c.key === key) ? t(`sof.category.${key}` as StringKey) : key;
}

export function groupClass(category: string | null): string {
  return `sof-g-${categoryGroup(category)}`;
}

export function groupLabel(group: SofGroup): string {
  return t(`sof.group.${group}` as StringKey);
}

/** `11:20–13:05`, `14:00` for an event without an end, `—` without times. */
export function timeRange(e: Pick<SofEvent, 'time_from' | 'time_to'>): string {
  if (e.time_from && e.time_to) return `${e.time_from}–${e.time_to}`;
  return e.time_from ?? e.time_to ?? '—';
}

/** `24.09` */
export function shortDate(iso: string): string {
  return formatDate(iso).slice(0, 5);
}

/** `24.09 Чт` — the day label of the timeline. */
export function dayLabel(iso: string): string {
  return `${shortDate(iso)} ${t(`sof.weekday.${weekdayOf(iso)}` as StringKey)}`;
}

/** `Погода 11:20–13:05` — how the overlap card and the delete prompt name an event. */
export function eventName(e: SofEvent): string {
  return `${categoryLabel(e.category)} ${timeRange(e)}`;
}
