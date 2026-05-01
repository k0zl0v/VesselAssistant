import { describe, expect, it } from 'vitest';
import {
  capacityTons,
  correctedWeight,
  emptySpace,
  emptyVolumePercent,
  totalEmpty,
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

describe('correctedWeight', () => {
  it('divides scale weight by crane coefficient', () => {
    expect(correctedWeight(100, 0.95)).toBeCloseTo(105.263, 3);
  });

  it('throws on non-positive coefficient', () => {
    expect(() => correctedWeight(100, 0)).toThrow(/crane coefficient/);
  });
});
