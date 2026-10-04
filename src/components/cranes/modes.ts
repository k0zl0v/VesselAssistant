import { formatTons } from '../../calc/round';
import type { StringKey } from '../../i18n';
import type { CraneMode } from '../../services/CraneShiftService';

export interface ModeMeta {
  label: StringKey;
  subtitle: StringKey;
  /** SVG path on the 24×24 grid of the mode badge (CraneCorrection mockup). */
  icon: string;
}

export const MODE_META: Record<CraneMode, ModeMeta> = {
  from_own: { label: 'cranes.mode.from_own', subtitle: 'cranes.mode_sub.from_own', icon: 'M12 4v12M7 11l5 5 5-5M4 20h16' },
  direct: { label: 'cranes.mode.direct', subtitle: 'cranes.mode_sub.direct', icon: 'M4 12h16M14 6l6 6-6 6' },
  into_own_port: { label: 'cranes.mode.into_own_port', subtitle: 'cranes.mode_sub.into_own', icon: 'M12 20V8M7 13l5-5 5 5M4 4h16' },
  into_own_starboard: {
    label: 'cranes.mode.into_own_starboard',
    subtitle: 'cranes.mode_sub.into_own',
    icon: 'M12 20V8M7 13l5-5 5 5M4 4h16',
  },
};

/** Coefficients always carry three decimals: `1.060`, not `1.06` (ui-kit § Числа). */
export const formatK = (k: number): string => k.toFixed(3);

/** `+12.500` / `−429.029`: the sign is always written on a correction. */
export const formatSigned = (x: number): string => (x > 0 ? `+${formatTons(x)}` : formatTons(x));

/** Local calendar date: the ship PC's clock, not UTC. */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** `"1,06"` and `"1.06"` both parse — operators type the decimal comma from the Excel habit. */
export function parseDecimal(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
