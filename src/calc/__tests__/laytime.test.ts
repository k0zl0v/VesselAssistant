import { describe, expect, it } from 'vitest';
import {
  calendarSpanDays,
  categoryGroup,
  coveredMinutes,
  durationMinutes,
  eventDays,
  findOverlapPairs,
  formatDuration,
  groupMinutes,
  summarizeSof,
  weekdayOf,
  type SofLikeEvent,
} from '../laytime';
import { findOverlapping } from '../time';

const ev = (event_date: string, time_from: string | null, time_to: string | null, category: string | null): SofLikeEvent => ({
  event_date,
  time_from,
  time_to,
  category,
});

/** The Sof.dc.html mockup log: one weather/discharge overlap on 24.09, a 24:00 end on 23.09. */
const MOCKUP_LOG: SofLikeEvent[] = [
  ev('2026-09-22', '06:30', '07:00', 'arrival'),
  ev('2026-09-22', '07:00', '07:30', 'nor_tendered'),
  ev('2026-09-22', '14:00', null, 'nor_accepted'),
  ev('2026-09-23', '08:00', '08:45', 'berthed'),
  ev('2026-09-23', '09:00', '24:00', 'loading_commenced'),
  ev('2026-09-24', '00:00', '11:20', 'loading_completed'),
  ev('2026-09-24', '11:20', '13:05', 'weather'),
  ev('2026-09-24', '12:40', '15:00', 'discharging_commenced'),
  ev('2026-09-25', '09:15', '13:40', 'discharging_commenced'),
  ev('2026-09-27', '07:00', '07:30', 'departure'),
];

describe('categoryGroup', () => {
  it('maps SOF_CATEGORIES keys to the legend groups', () => {
    expect(categoryGroup('loading_commenced')).toBe('loading');
    expect(categoryGroup('discharging_completed')).toBe('discharging');
    expect(categoryGroup('weather')).toBe('weather');
    expect(categoryGroup('nor_tendered')).toBe('port');
    expect(categoryGroup('waiting')).toBe('port');
    expect(categoryGroup('bunkering')).toBe('other');
  });

  it('puts unknown and empty categories into other', () => {
    expect(categoryGroup(null)).toBe('other');
    expect(categoryGroup('')).toBe('other');
    expect(categoryGroup('custom')).toBe('other');
  });
});

describe('durationMinutes', () => {
  it('treats 24:00 as the end of the day', () => {
    expect(durationMinutes(ev('2026-09-23', '09:00', '24:00', null))).toBe(900);
  });

  it('is null for an event without an end', () => {
    expect(durationMinutes(ev('2026-09-22', '14:00', null, null))).toBeNull();
    expect(durationMinutes(ev('2026-09-22', null, null, null))).toBeNull();
  });
});

describe('coveredMinutes', () => {
  it('counts overlapping intervals once', () => {
    expect(
      coveredMinutes([ev('2026-05-01', '22:00', '24:00', null), ev('2026-05-01', '23:00', '23:30', null)]),
    ).toBe(120);
  });

  it('merges touching intervals and keeps gaps out', () => {
    expect(
      coveredMinutes([
        ev('2026-05-01', '08:00', '09:00', null),
        ev('2026-05-01', '09:00', '10:00', null),
        ev('2026-05-01', '11:00', '11:30', null),
      ]),
    ).toBe(150);
  });

  it('does not merge the same clock times on different days', () => {
    expect(
      coveredMinutes([ev('2026-05-01', '22:00', '24:00', null), ev('2026-05-02', '00:00', '04:00', null)]),
    ).toBe(360);
  });

  it('ignores open-ended and zero-length events', () => {
    expect(coveredMinutes([ev('2026-05-01', '10:00', null, null), ev('2026-05-01', '10:00', '10:00', null)])).toBe(0);
  });

  it('is order-independent', () => {
    const list = [ev('2026-05-01', '12:00', '14:00', null), ev('2026-05-01', '08:00', '13:00', null)];
    expect(coveredMinutes(list)).toBe(360);
    expect(coveredMinutes([...list].reverse())).toBe(360);
  });
});

describe('groupMinutes', () => {
  it('sums only the requested groups', () => {
    expect(groupMinutes(MOCKUP_LOG, ['weather'])).toBe(105);
    // 15:00 + 11:20 of loading, 02:20 + 04:25 of discharging.
    expect(groupMinutes(MOCKUP_LOG, ['loading', 'discharging'])).toBe(900 + 680 + 140 + 265);
  });
});

describe('findOverlapPairs', () => {
  it('names the same events findOverlapping marks', () => {
    const pairs = findOverlapPairs(MOCKUP_LOG);
    expect(pairs).toEqual([{ a: 6, b: 7 }]);
    const flagged = new Set(pairs.flatMap((p) => [p.a, p.b]));
    expect(flagged).toEqual(findOverlapping(MOCKUP_LOG));
  });

  it('treats [from, to) as half-open: back-to-back is not an overlap', () => {
    expect(findOverlapPairs([ev('2026-05-01', '22:00', '24:00', null), ev('2026-05-02', '00:00', '04:00', null)])).toEqual([]);
    expect(findOverlapPairs([ev('2026-05-01', '08:00', '09:00', null), ev('2026-05-01', '09:00', '10:00', null)])).toEqual([]);
  });

  it('lists every pair when three events overlap', () => {
    const list = [
      ev('2026-05-01', '08:00', '12:00', null),
      ev('2026-05-01', '09:00', '10:00', null),
      ev('2026-05-01', '09:30', '11:00', null),
    ];
    expect(findOverlapPairs(list)).toEqual([
      { a: 0, b: 1 },
      { a: 0, b: 2 },
      { a: 1, b: 2 },
    ]);
  });
});

describe('dates', () => {
  it('lists distinct days in order', () => {
    expect(eventDays([ev('2026-09-24', null, null, null), ev('2026-09-22', null, null, null), ev('2026-09-24', null, null, null)])).toEqual([
      '2026-09-22',
      '2026-09-24',
    ]);
  });

  it('counts the calendar span inclusively, across a month end', () => {
    expect(calendarSpanDays('2026-09-22', '2026-09-27')).toBe(6);
    expect(calendarSpanDays('2026-09-30', '2026-10-01')).toBe(2);
    expect(calendarSpanDays('2026-09-22', '2026-09-22')).toBe(1);
  });

  it('gives the weekday independent of the local time zone', () => {
    expect(weekdayOf('2026-09-22')).toBe(2); // Tuesday
    expect(weekdayOf('2026-09-27')).toBe(0); // Sunday
  });
});

describe('formatDuration', () => {
  it('pads and does not wrap at 24 hours', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(105)).toBe('01:45');
    expect(formatDuration(1985)).toBe('33:05');
  });
});

describe('summarizeSof', () => {
  it('summarises the mockup log', () => {
    const s = summarizeSof(MOCKUP_LOG);
    expect(s).toMatchObject({
      eventCount: 10,
      firstDate: '2026-09-22',
      lastDate: '2026-09-27',
      spanDays: 6,
      workingMinutes: 1985,
      weatherMinutes: 105,
      weatherEventCount: 1,
    });
    expect(s.overlapPairs).toHaveLength(1);
    expect(formatDuration(s.workingMinutes)).toBe('33:05');
  });

  it('is empty-safe', () => {
    expect(summarizeSof([])).toEqual({
      eventCount: 0,
      firstDate: null,
      lastDate: null,
      spanDays: 0,
      workingMinutes: 0,
      weatherMinutes: 0,
      weatherEventCount: 0,
      overlapPairs: [],
    });
  });
});
