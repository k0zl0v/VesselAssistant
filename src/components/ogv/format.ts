import { formatTons, roundTo3 } from '../../calc/round';
import type { t as T } from '../../i18n';
import type { OgvStepView } from '../../services/OgvVesselService';
import { formatDate } from '../../shell/format';

/** `2026-09-24 12:40` → `24.09 12:40`; a bare date → `24.09.2026`; nothing → em dash. */
export function formatStamp(value: string | null): string {
  if (!value) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/.exec(value);
  return m ? `${m[3]}.${m[2]} ${m[4]}` : formatDate(value);
}

/** Date + optional time as stored in `ogv_receipts.started_at`. */
export function joinStamp(date: string, time: string): string | null {
  if (!date) return null;
  return time ? `${date} ${time}` : date;
}

export function stepLabel(t: typeof T, s: OgvStepView): string {
  return s.label ?? t('ogv.step.label_default', { no: s.ogv_hold_no, tons: formatTons(s.planned_tons) });
}

export function stepStateText(t: typeof T, s: OgvStepView): string {
  if (s.state === 'done') return t('ogv.step.done');
  if (s.state === 'current') return t('ogv.step.current');
  return t('ogv.step.pending', { tons: formatTons(s.remain_tons) });
}

/** Option text of an OGV hold picker: what is left, or how far over plan. */
export function holdRemainText(t: typeof T, hold_no: number, remain: number): string {
  const r = roundTo3(remain);
  if (r > 0) return t('discharge.ogv_hold.option', { no: hold_no, tons: formatTons(remain) });
  if (r === 0) return t('discharge.ogv_hold.option_full', { no: hold_no });
  return t('discharge.ogv_hold.option_over', { no: hold_no, tons: formatTons(-remain) });
}

export const today = (): string => new Date().toISOString().slice(0, 10);

/** A translated sentence around a `{slot}`, so the number can be set in mono. */
export function splitSlot(text: string, slot: string): [string, string] {
  const i = text.indexOf(slot);
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + slot.length)];
}
