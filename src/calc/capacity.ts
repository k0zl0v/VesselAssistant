import type { HoldCapacityInput } from './types';

export interface OverloadCheckInput {
  hold_volume_m3: number;
  sf: number;
  fill_percent: number;
  current_remain_tons: number;
  added_tons: number;
}

export interface OverloadCheckResult {
  capacity_tons: number;
  projected_remain_tons: number;
  overshoot_tons: number;
  overloads: boolean;
}

/**
 * Predicate: would adding `added_tons` to a hold's existing remaining tonnage
 * push the hold beyond its FillPercent capacity? (TZ §8 rule 2, AT-05.)
 *
 * Floating-point tolerance: an overshoot below 1e-6 is treated as no overload
 * (so adding exactly the remaining capacity does not trip the guard).
 */
export function wouldOverload(input: OverloadCheckInput): OverloadCheckResult {
  const capacity_tons = capacityTons({
    hold_volume_m3: input.hold_volume_m3,
    sf: input.sf,
    fill_percent: input.fill_percent,
  });
  const projected_remain_tons = input.current_remain_tons + input.added_tons;
  const rawOvershoot = projected_remain_tons - capacity_tons;
  const overloads = rawOvershoot > 1e-6;
  const overshoot_tons = overloads
    ? Math.round(rawOvershoot * 1000) / 1000
    : 0;
  return {
    capacity_tons,
    projected_remain_tons,
    overshoot_tons,
    overloads,
  };
}

/**
 * Capacity in tons at the configured fill percent.
 * Throws if SF <= 0 — division-by-zero guard (TZ §8 rule 1).
 */
export function capacityTons({
  hold_volume_m3,
  sf,
  fill_percent,
}: HoldCapacityInput): number {
  if (sf <= 0) {
    throw new Error(`SF must be > 0, got ${sf}`);
  }
  if (fill_percent < 0 || fill_percent > 1) {
    throw new Error(`fill_percent must be in [0, 1], got ${fill_percent}`);
  }
  return (hold_volume_m3 * fill_percent) / sf;
}

/**
 * Empty space for a single hold. Negative values are NOT clamped here —
 * callers display them as discrepancy (TZ §8 rule 3). The TotalEmpty
 * aggregate is the one that clamps to 0 (TZ §5).
 */
export function emptySpace(
  capacity_tons: number,
  remain_tons: number,
): number {
  return capacity_tons - remain_tons;
}

/** Total empty space across holds, clamping negatives to 0. */
export function totalEmpty(emptySpaces: number[]): number {
  return emptySpaces.reduce((sum, x) => sum + Math.max(0, x), 0);
}

/** Empty volume percent for a hold. */
export function emptyVolumePercent(
  loaded_volume_m3: number,
  hold_volume_m3: number,
): number {
  if (hold_volume_m3 <= 0) {
    throw new Error(`hold volume must be > 0, got ${hold_volume_m3}`);
  }
  return 100 - (loaded_volume_m3 / hold_volume_m3) * 100;
}

/** Crane corrected weight (TZ §5). */
export function correctedWeight(
  scale_weight: number,
  crane_coefficient: number,
): number {
  if (crane_coefficient <= 0) {
    throw new Error(`crane coefficient must be > 0, got ${crane_coefficient}`);
  }
  return scale_weight / crane_coefficient;
}
