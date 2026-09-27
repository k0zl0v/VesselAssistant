/**
 * Cargo colour is data-driven, so it goes through an explicit map onto tokens
 * (ui-kit: SFM → --cargo-sfm, WHEAT → --cargo-wheat, anything else → fallback).
 */
export function cargoColor(name: string | null | undefined): string {
  const n = (name ?? '').toUpperCase();
  if (n.includes('SFM')) return 'var(--cargo-sfm)';
  if (n.includes('WHEAT')) return 'var(--cargo-wheat)';
  return 'var(--cargo-fallback)';
}
