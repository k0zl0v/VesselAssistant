import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  averageOfIncluded,
  CraneShiftService,
  modeCraneKey,
  summarizeShift,
  workingOn,
  type CraneMode,
} from '../CraneShiftService';
import { CargoLotService } from '../CargoLotService';
import { isAppError } from '../errors';
import { OgvService } from '../OgvService';
import { ReferenceService } from '../ReferenceService';
import { SessionService } from '../SessionService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';

/** excel-reference §2: the 01.05 shift of the real working file. */
const SHIFT: readonly { mode: CraneMode; crane: 1 | 2; scale: number; k: number; corrected: number }[] = [
  { mode: 'from_own', crane: 1, scale: 1177, k: 1.06, corrected: 1110.377 },
  { mode: 'from_own', crane: 2, scale: 824, k: 0.96, corrected: 858.333 },
  { mode: 'direct', crane: 1, scale: 2154, k: 1.13, corrected: 1906.195 },
  { mode: 'direct', crane: 2, scale: 610, k: 1.04, corrected: 586.538 },
  { mode: 'into_own_port', crane: 1, scale: 1387, k: 1.06, corrected: 1308.491 },
  { mode: 'into_own_port', crane: 2, scale: 604, k: 1.01, corrected: 598.02 },
  { mode: 'into_own_starboard', crane: 1, scale: 1269, k: 0.98, corrected: 1294.898 },
  { mode: 'into_own_starboard', crane: 2, scale: 810, k: 1.09, corrected: 743.119 },
];

describe('CraneShiftService', () => {
  let db: NodeDb;
  let svc: CraneShiftService;
  let voyageId: string;
  let c1: string;
  let c2: string;
  const crane = (n: 1 | 2): string => (n === 1 ? c1 : c2);

  async function seedWorking(valid_from = '2025-11-09'): Promise<void> {
    for (const s of SHIFT) {
      await svc.setWorkingCoefficient({ crane_id: crane(s.crane), mode: s.mode, coefficient: s.k, valid_from });
    }
  }

  beforeEach(async () => {
    db = await openTestDb();
    const ref = new ReferenceService(db);
    c1 = (await ref.createCrane({ name: 'CRANE # 1' })).id;
    c2 = (await ref.createCrane({ name: 'CRANE # 2' })).id;
    const { vesselId } = await seedReferenceData(db, { vesselName: 'TEST', holdNos: [1] });
    voyageId = (await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: vesselId, voyage_no: 'V-1' })).id;
    svc = new CraneShiftService(db);
  });

  afterEach(() => db.close());

  it('corrected = scale ÷ working coefficient: 2154 / 1.13 = 1906.195', async () => {
    await seedWorking();
    const r = await svc.correct(2154, c1, 'direct', '2026-05-01');
    expect(r.coefficient).toBe(1.13);
    expect(r.corrected_tons).toBeCloseTo(1906.195, 3);
  });

  it('records the whole §2 shift: 8 835.000 by scales → 8 405.971 corrected, delta −429.029', async () => {
    await seedWorking();
    const rows = await svc.recordShift({
      voyage_id: voyageId,
      shift_date: '2026-05-01',
      entries: SHIFT.map((s) => ({ crane_id: crane(s.crane), mode: s.mode, scale_tons: s.scale })),
    });
    expect(rows).toHaveLength(8);
    for (const s of SHIFT) {
      const row = rows.find((r) => r.mode === s.mode && r.crane_id === crane(s.crane))!;
      expect(row.coefficient).toBe(s.k);
      expect(row.corrected_tons).toBeCloseTo(s.corrected, 3);
    }

    const totals = await svc.totals(voyageId, '2026-05-01');
    expect(totals.count).toBe(8);
    expect(totals.scale_tons).toBeCloseTo(8835, 9);
    expect(totals.corrected_tons).toBeCloseTo(8405.971, 3);
    expect(totals.delta_tons).toBeCloseTo(-429.029, 3);
    // Scale weight «ИЗ СЕБЯ» = the Load Plan's Discharged (excel-reference §2).
    expect(totals.byMode.from_own.scale_tons).toBe(2001);
    expect(totals.byModeCrane[modeCraneKey('direct', c1)]!.corrected_tons).toBeCloseTo(1906.195, 3);
  });

  it('freezes the coefficient on the line: a later working value does not rewrite past shifts', async () => {
    await seedWorking();
    await svc.recordShift({ voyage_id: voyageId, shift_date: '2026-05-01', entries: [{ crane_id: c1, mode: 'direct', scale_tons: 2154 }] });
    await svc.setWorkingCoefficient({ crane_id: c1, mode: 'direct', coefficient: 1.2, valid_from: '2026-05-02' });
    await svc.recordShift({ voyage_id: voyageId, shift_date: '2026-05-02', entries: [{ crane_id: c1, mode: 'direct', scale_tons: 120 }] });

    const all = await svc.listShiftRecords(voyageId);
    expect(all.map((r) => [r.shift_date, r.coefficient])).toEqual([
      ['2026-05-01', 1.13],
      ['2026-05-02', 1.2],
    ]);
    expect(await svc.shiftDates(voyageId)).toEqual(['2026-05-02', '2026-05-01']);
    expect((await svc.totals(voyageId)).scale_tons).toBe(2274);
  });

  it('a shift with a mode lacking a working value on the date writes nothing', async () => {
    await svc.setWorkingCoefficient({ crane_id: c1, mode: 'from_own', coefficient: 1.06, valid_from: '2026-01-01' });
    const err = await svc
      .recordShift({
        voyage_id: voyageId,
        shift_date: '2026-05-01',
        entries: [
          { crane_id: c1, mode: 'from_own', scale_tons: 100 },
          { crane_id: c2, mode: 'from_own', scale_tons: 100 },
        ],
      })
      .catch((e: unknown) => e);
    expect(isAppError(err) && err.code).toBe('crane.no_coefficient');
    expect(await svc.listShiftRecords(voyageId)).toHaveLength(0);
  });

  it('rejects non-positive scale weights and an empty shift', async () => {
    await seedWorking();
    await expect(
      svc.recordShift({ voyage_id: voyageId, shift_date: '2026-05-01', entries: [{ crane_id: c1, mode: 'direct', scale_tons: 0 }] }),
    ).rejects.toThrow(/scale_tons must be > 0/);
    await expect(svc.recordShift({ voyage_id: voyageId, shift_date: '2026-05-01', entries: [] })).rejects.toThrow(/at least one/);
  });

  it('closed voyage: an operator cannot record; a supervisor can, with a reason that lands in the audit log', async () => {
    await seedWorking();
    await new VoyageService(db, NOOP_AUTO_BACKUP).close(voyageId);
    const entries = [{ crane_id: c1, mode: 'direct' as const, scale_tons: 10 }];
    const err = await svc.recordShift({ voyage_id: voyageId, shift_date: '2026-05-01', entries }).catch((e: unknown) => e);
    expect(isAppError(err) && err.code).toBe('voyage.closed');

    await new SessionService(db).start({ operator_name: 'chief-mate', operator_role: 'supervisor' });
    await svc.recordShift({ voyage_id: voyageId, shift_date: '2026-05-01', entries }, { closed_voyage_reason: 'late scale ticket' });
    const [audit] = await db.select<{ reason: string }>(
      `SELECT reason FROM audit_log WHERE entity_type = 'crane_shift_records' AND action = 'insert'`,
    );
    expect(audit?.reason).toBe('late scale ticket');
  });

  it('links an «ИЗ СЕБЯ» line to a discharge operation and deletes a line', async () => {
    await seedWorking();
    const [hold] = await db.select<{ id: string }>(`SELECT id FROM holds LIMIT 1`);
    const opId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO operations (id, voyage_id, type, event_date, time_from, source_hold, tons) VALUES (?, ?, 'discharge', ?, ?, ?, ?)`,
      [opId, voyageId, '2026-05-01', '12:05', hold!.id, 1177],
    );
    const ops = await svc.listDischargeOperations(voyageId, '2026-05-01');
    expect(ops.map((o) => o.id)).toEqual([opId]);

    const [line] = await svc.recordShift({
      voyage_id: voyageId,
      shift_date: '2026-05-01',
      entries: [{ crane_id: c1, mode: 'from_own', scale_tons: 1177, operation_id: opId, note: '  ' }],
    });
    expect(line).toMatchObject({ operation_id: opId, note: null });

    await svc.deleteShiftRecord(line!.id);
    expect(await svc.listShiftRecords(voyageId)).toHaveLength(0);
  });

  it('measurements: add, exclude an outlier, average over the included (ПРЯМА / Кран 1 → 1.116)', async () => {
    const history: [string, string, number][] = [
      ['GAMMA', '2025-02-14', 1.07],
      ['Lubov', '2025-08-09', 1.1],
      ['Шилайняй', '2025-08-17', 1.1],
      ['Anastasia V', '2025-08-27', 1.178],
      ['Lydia V', '2025-08-28', 1.13],
      ['I. Vikulov', '2025-10-19', 1.39],
    ];
    for (const [vessel_name, measured_on, coefficient] of history.reverse()) {
      await svc.addMeasurement({ crane_id: c1, mode: 'direct', vessel_name, measured_on, coefficient });
    }
    await svc.addMeasurement({ crane_id: c2, mode: 'direct', measured_on: '2025-01-01', coefficient: 5 });

    const list = await svc.listMeasurements({ crane_id: c1, mode: 'direct' });
    expect(list.map((m) => m.measured_on)).toEqual([...history].reverse().map((h) => h[1]));
    expect(list.every((m) => m.excluded === false)).toBe(true);

    const outlier = list.find((m) => m.coefficient === 1.39)!;
    await svc.setMeasurementExcluded(outlier.id, true);
    expect(await svc.averageIncluded(c1, 'direct')).toBeCloseTo(1.1156, 4);
    expect((await svc.listMeasurements({ crane_id: c1, mode: 'direct' })).find((m) => m.id === outlier.id)!.excluded).toBe(true);

    await svc.setMeasurementExcluded(outlier.id, false);
    expect(await svc.averageIncluded(c1, 'direct')).toBeCloseTo(1.161333, 5);
    expect(await svc.averageIncluded(c1, 'from_own')).toBeNull();
  });

  it('rejects a measurement with a bad date or a non-positive coefficient', async () => {
    await expect(svc.addMeasurement({ crane_id: c1, mode: 'direct', measured_on: '14.02.2025', coefficient: 1 })).rejects.toThrow(
      /measured_on must be YYYY-MM-DD/,
    );
    await expect(svc.addMeasurement({ crane_id: c1, mode: 'direct', measured_on: '2025-02-14', coefficient: 0 })).rejects.toThrow(
      /coefficient must be > 0/,
    );
  });

  it('working coefficient: history kept, the same day replaced, lookup by date', async () => {
    await svc.setWorkingCoefficient({ crane_id: c1, mode: 'direct', coefficient: 1.1, valid_from: '2025-01-01' });
    await svc.setWorkingCoefficient({ crane_id: c1, mode: 'direct', coefficient: 1.12, valid_from: '2025-11-09' });
    await svc.setWorkingCoefficient({ crane_id: c1, mode: 'direct', coefficient: 1.13, valid_from: '2025-11-09' });

    const history = await svc.listWorkingCoefficients({ crane_id: c1, mode: 'direct' });
    expect(history.map((w) => [w.valid_from, w.coefficient])).toEqual([
      ['2025-11-09', 1.13],
      ['2025-01-01', 1.1],
    ]);
    expect((await svc.workingCoefficient(c1, 'direct', '2025-06-01')).coefficient).toBe(1.1);
    expect((await svc.workingCoefficient(c1, 'direct', '2026-05-01')).coefficient).toBe(1.13);
    expect(workingOn(history, c1, 'direct', '2025-06-01')?.coefficient).toBe(1.1);
    expect(workingOn(history, c1, 'direct', '2024-12-31')).toBeNull();

    const err = await svc.workingCoefficient(c1, 'direct', '2024-12-31').catch((e: unknown) => e);
    expect(isAppError(err) && err.code).toBe('crane.no_coefficient');
    await expect(svc.setWorkingCoefficient({ crane_id: c1, mode: 'direct', coefficient: -1, valid_from: '2026-01-01' })).rejects.toThrow(
      /coefficient must be > 0/,
    );
  });

  it('dischargedTons sums the LIFO allocations, per voyage or per date', async () => {
    expect(await svc.dischargedTons(voyageId)).toBe(0);
    const [hold] = await db.select<{ id: string }>(`SELECT id FROM holds LIMIT 1`);
    const [cargo] = await db.select<{ id: string }>(`SELECT id FROM cargoes LIMIT 1`);
    await new CargoLotService(db).add({
      voyage_id: voyageId, hold_id: hold!.id, cargo_id: cargo!.id, source_vessel: 'VLADIMIR',
      sf: 1.3, planned_tons: 3000, loaded_tons: 3000,
    });
    const ogv = new OgvService(db);
    await ogv.discharge({ voyage_id: voyageId, hold_id: hold!.id, tons: 1177, event_date: '2026-05-01' });
    await ogv.discharge({ voyage_id: voyageId, hold_id: hold!.id, tons: 824, event_date: '2026-05-02' });
    expect(await svc.dischargedTons(voyageId)).toBe(2001);
    expect(await svc.dischargedTons(voyageId, '2026-05-01')).toBe(1177);
    expect((await svc.listDischargeOperations(voyageId)).map((o) => [o.event_date, o.tons, o.hold_no])).toEqual([
      ['2026-05-01', 1177, 1],
      ['2026-05-02', 824, 1],
    ]);
  });
});

describe('crane pure helpers', () => {
  it('averageOfIncluded ignores excluded rows and returns null when none remain', () => {
    expect(averageOfIncluded([{ coefficient: 1, excluded: false }, { coefficient: 2, excluded: true }])).toBe(1);
    expect(averageOfIncluded([{ coefficient: 2, excluded: true }])).toBeNull();
  });

  it('summarizeShift starts every mode at zero', () => {
    const s = summarizeShift([]);
    expect(s.count).toBe(0);
    expect(s.byMode.into_own_starboard).toEqual({ scale_tons: 0, corrected_tons: 0, delta_tons: 0, count: 0 });
  });
});
