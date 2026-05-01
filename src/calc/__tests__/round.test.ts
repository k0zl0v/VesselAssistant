import { describe, expect, it } from 'vitest';
import { formatTons, roundTo3 } from '../round';

describe('roundTo3', () => {
  it('matches Excel ROUND for positive values', () => {
    expect(roundTo3(15881.92402957)).toBe(15881.924);
    expect(roundTo3(0.0005)).toBe(0.001);
    expect(roundTo3(0.0004)).toBe(0);
    expect(roundTo3(2001)).toBe(2001);
  });

  it('preserves integer values', () => {
    expect(roundTo3(1600)).toBe(1600);
  });
});

describe('formatTons', () => {
  it('always renders 3 decimals', () => {
    expect(formatTons(2001)).toBe('2001.000');
    expect(formatTons(15881.924)).toBe('15881.924');
    expect(formatTons(0)).toBe('0.000');
  });
});
