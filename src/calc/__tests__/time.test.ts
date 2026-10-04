import { describe, expect, it } from 'vitest';
import { dailyDischargeTotals, findOverlapping, normalizeTime, timeToMinutes } from '../time';

describe('timeToMinutes', () => {
  it('parses HH:MM and zero-pads', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('9:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });

  it('accepts 24:00 as end-of-day', () => {
    expect(timeToMinutes('24:00')).toBe(1440);
  });

  it('rejects 24:xx where xx > 0', () => {
    expect(() => timeToMinutes('24:01')).toThrow(/24:xx/);
    expect(() => timeToMinutes('24:30')).toThrow(/24:xx/);
  });

  it('rejects invalid formats', () => {
    expect(() => timeToMinutes('abc')).toThrow(/Invalid time format/);
    expect(() => timeToMinutes('25:00')).toThrow(/Invalid hours/);
    expect(() => timeToMinutes('12:60')).toThrow(/Invalid minutes/);
  });

  it('treats empty string and null as null', () => {
    expect(timeToMinutes('')).toBeNull();
    expect(timeToMinutes(null)).toBeNull();
  });
});

describe('normalizeTime', () => {
  it('zero-pads hours', () => {
    expect(normalizeTime('9:30')).toBe('09:30');
    expect(normalizeTime('09:30')).toBe('09:30');
  });

  it('preserves 24:00', () => {
    expect(normalizeTime('24:00')).toBe('24:00');
  });
});

describe('findOverlapping', () => {
  it('returns empty set when no events overlap', () => {
    const events = [
      { event_date: '2026-05-01', time_from: '08:00', time_to: '09:00' },
      { event_date: '2026-05-01', time_from: '09:00', time_to: '10:00' },
      { event_date: '2026-05-01', time_from: '10:00', time_to: '11:00' },
    ];
    expect(findOverlapping(events)).toEqual(new Set());
  });

  it('flags overlapping events on the same date', () => {
    const events = [
      { event_date: '2026-05-01', time_from: '08:00', time_to: '10:00' },
      { event_date: '2026-05-01', time_from: '09:30', time_to: '11:00' },
    ];
    expect(findOverlapping(events)).toEqual(new Set([0, 1]));
  });

  it('ignores events on different dates', () => {
    const events = [
      { event_date: '2026-05-01', time_from: '08:00', time_to: '12:00' },
      { event_date: '2026-05-02', time_from: '08:00', time_to: '12:00' },
    ];
    expect(findOverlapping(events)).toEqual(new Set());
  });

  it('does not flag events that touch but do not overlap (open interval)', () => {
    const events = [
      { event_date: '2026-05-01', time_from: '08:00', time_to: '10:00' },
      { event_date: '2026-05-01', time_from: '10:00', time_to: '12:00' },
    ];
    expect(findOverlapping(events)).toEqual(new Set());
  });

  it('handles 24:00 as end-of-day correctly', () => {
    const events = [
      { event_date: '2026-05-01', time_from: '22:00', time_to: '24:00' },
      { event_date: '2026-05-01', time_from: '23:00', time_to: '24:00' },
    ];
    expect(findOverlapping(events)).toEqual(new Set([0, 1]));
  });

  it('skips events without complete time interval', () => {
    const events = [
      { event_date: '2026-05-01', time_from: null, time_to: null },
      { event_date: '2026-05-01', time_from: '08:00', time_to: '10:00' },
    ];
    expect(findOverlapping(events)).toEqual(new Set());
  });
});

describe('dailyDischargeTotals', () => {
  it('sums operations per date and carries the running total in date order', () => {
    const ops = [
      { event_date: '2026-09-25', tons: 824 },
      { event_date: '2026-09-24', tons: 1000.25 },
      { event_date: '2026-09-24', tons: 176.75 },
    ];
    expect(dailyDischargeTotals(ops)).toEqual([
      { date: '2026-09-24', tons: 1177, total: 1177 },
      { date: '2026-09-25', tons: 824, total: 2001 },
    ]);
  });

  it('keeps full precision (rounding belongs to the display)', () => {
    const [day] = dailyDischargeTotals([
      { event_date: '2026-05-01', tons: 0.0004 },
      { event_date: '2026-05-01', tons: 0.0004 },
    ]);
    expect(day!.tons).toBeCloseTo(0.0008, 10);
  });

  it('returns an empty list without operations', () => {
    expect(dailyDischargeTotals([])).toEqual([]);
  });
});
