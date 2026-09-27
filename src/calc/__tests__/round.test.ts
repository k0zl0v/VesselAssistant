import { describe, expect, it } from 'vitest';
import { formatPercent, formatTons, roundTo3 } from '../round';

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
    expect(formatTons(2001)).toBe('2\u202F001.000');
    expect(formatTons(15881.924)).toBe('15\u202F881.924');
    expect(formatTons(0)).toBe('0.000');
    expect(formatTons(999.9996)).toBe('1\u202F000.000');
  });

  it('groups thousands with U+202F and marks negatives with U+2212', () => {
    expect(formatTons(1234567.891)).toBe('1\u202F234\u202F567.891');
    expect(formatTons(-142.5)).toBe('\u2212142.500');
    expect(formatTons(-0.0001)).toBe('0.000');
  });
});

describe('formatPercent', () => {
  it('renders one decimal with a non-breaking space before %', () => {
    expect(formatPercent(58)).toBe('58.0\u00A0%');
    expect(formatPercent(101.46)).toBe('101.5\u00A0%');
  });
});
