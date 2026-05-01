import { describe, expect, it } from 'vitest';
import {
  capacityTons,
  correctedWeight,
  emptySpace,
  emptyVolumePercent,
  totalEmpty,
  wouldOverload,
} from '../capacity';

describe('capacityTons', () => {
  it('computes capacity at 0.98 fill percent', () => {
    expect(capacityTons({ hold_volume_m3: 1000, sf: 1.25, fill_percent: 0.98 }))
      .toBeCloseTo(784, 3);
  });

  it('throws on SF = 0', () => {
    expect(() =>
      capacityTons({ hold_volume_m3: 1000, sf: 0, fill_percent: 0.98 }),
    ).toThrow(/SF must be > 0/);
  });

  it('throws on fill_percent out of range', () => {
    expect(() =>
      capacityTons({ hold_volume_m3: 1000, sf: 1.25, fill_percent: 1.5 }),
    ).toThrow(/fill_percent/);
  });
});

describe('emptySpace and totalEmpty', () => {
  it('emptySpace can be negative (per-hold discrepancy is preserved)', () => {
    expect(emptySpace(100, 150)).toBe(-50);
  });

  it('totalEmpty clamps negatives to 0 in the sum', () => {
    expect(totalEmpty([100, -50, 200])).toBe(300);
  });
});

describe('emptyVolumePercent', () => {
  it('matches Excel formula', () => {
    expect(emptyVolumePercent(800, 1000)).toBe(20);
  });

  it('throws on zero hold volume', () => {
    expect(() => emptyVolumePercent(0, 0)).toThrow(/hold volume/);
  });
});

describe('wouldOverload', () => {
  // KAVKAZ IV Hold 3: volume 10749.8, sf 1.44, fill 0.98
  // capacity = 10749.8 * 0.98 / 1.44 = 7315.836111...
  const HOLD = { hold_volume_m3: 10749.8, sf: 1.44, fill_percent: 0.98 };

  it('AT-05: adding tons that exactly reach 98% capacity does NOT overload', () => {
    // 2825 already loaded; remaining headroom ~ 4490.836 t. Add 4490 → fits.
    const r = wouldOverload({
      ...HOLD,
      current_remain_tons: 2825,
      added_tons: 4490,
    });
    expect(r.overloads).toBe(false);
    expect(r.overshoot_tons).toBe(0);
    expect(r.capacity_tons).toBeCloseTo(7315.836, 3);
  });

  it('AT-05: 1 t too much overshoots by ~0.164 t', () => {
    const r = wouldOverload({
      ...HOLD,
      current_remain_tons: 2825,
      added_tons: 4491,
    });
    expect(r.overloads).toBe(true);
    expect(r.overshoot_tons).toBeCloseTo(0.164, 3);
    expect(r.projected_remain_tons).toBeCloseTo(7316, 3);
  });

  it('throws on SF = 0 (delegates to capacityTons)', () => {
    expect(() =>
      wouldOverload({
        hold_volume_m3: 1000,
        sf: 0,
        fill_percent: 0.98,
        current_remain_tons: 0,
        added_tons: 100,
      }),
    ).toThrow(/SF must be > 0/);
  });

  it('current already at capacity, added_tons = 0 → no overload', () => {
    const r = wouldOverload({
      ...HOLD,
      current_remain_tons: 7315.836,
      added_tons: 0,
    });
    expect(r.overloads).toBe(false);
    expect(r.overshoot_tons).toBe(0);
  });

  it('floating-point edge: 1e-7 t over → not an overload', () => {
    const r = wouldOverload({
      hold_volume_m3: 1000,
      sf: 1.25,
      fill_percent: 0.98,
      current_remain_tons: 784,
      added_tons: 0.0000001,
    });
    expect(r.overloads).toBe(false);
    expect(r.overshoot_tons).toBe(0);
  });
});

describe('correctedWeight', () => {
  it('divides scale weight by crane coefficient', () => {
    expect(correctedWeight(100, 0.95)).toBeCloseTo(105.263, 3);
  });

  it('throws on non-positive coefficient', () => {
    expect(() => correctedWeight(100, 0)).toThrow(/crane coefficient/);
  });
});
