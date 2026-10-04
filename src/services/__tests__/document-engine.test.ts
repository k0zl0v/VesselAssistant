import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalculationService } from '../CalculationService';
import { CargoLotService } from '../CargoLotService';
import { CraneShiftService } from '../CraneShiftService';
import { DocumentEngine } from '../DocumentEngine';
import { OgvService } from '../OgvService';
import { SofService } from '../SofService';
import { VoyageService } from '../VoyageService';
import { KAVKAZ_IV_HOLDS, KAVKAZ_IV_TOTALS } from '../../fixtures/kavkaz-iv';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';

async function loadXlsx(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS expects ArrayBuffer (or buffer-like).
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  return wb;
}

describe('DocumentEngine — Load Plan XLSX export', () => {
  let db: NodeDb;
  let voyageId: string;
  let vesselId: string;

  beforeEach(async () => {
    db = await openTestDb();
    vesselId = crypto.randomUUID();
    await db.execute(
      `INSERT INTO vessels (id, name, flag) VALUES (?, ?, ?)`,
      [vesselId, 'KAVKAZ IV', 'PANAMA'],
    );

    const cargoIds: Record<string, string> = {};
    for (const c of ['SFM', 'WHEAT']) {
      const id = crypto.randomUUID();
      cargoIds[c] = id;
      await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [id, c]);
    }

    const holdIds: Record<number, string> = {};
    for (const h of KAVKAZ_IV_HOLDS) {
      const id = crypto.randomUUID();
      holdIds[h.hold_no] = id;
      await db.execute(
        `INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`,
        [id, vesselId, h.hold_no, h.volume_m3],
      );
    }

    const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({
      vessel_id: vesselId,
      voyage_no: 'EXPORT-001',
    });
    voyageId = voyage.id;

    const lots = new CargoLotService(db);
    const ogv = new OgvService(db);
    for (const h of KAVKAZ_IV_HOLDS) {
      await lots.add({
        voyage_id: voyageId,
        source_vessel: 'AGG',
        cargo_id: cargoIds[h.cargo]!,
        hold_id: holdIds[h.hold_no]!,
        sf: h.sf,
        planned_tons: h.loaded_tons,
        loaded_tons: h.loaded_tons,
      });
      if (h.discharged_tons > 0) {
        await ogv.discharge({
          voyage_id: voyageId,
          hold_id: holdIds[h.hold_no]!,
          tons: h.discharged_tons,
          event_date: '2026-05-01',
        });
      }
    }
  });

  afterEach(() => {
    db.close();
  });

  it('produces a valid XLSX byte stream', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    expect(bytes.length).toBeGreaterThan(2000);
    // PK ZIP magic — every XLSX file is a ZIP.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('contains all four sheets in the original template order', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    expect(wb.worksheets).toHaveLength(4);
    // Load plan first so a default-open shows the data, not an empty SOF.
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'KAVKAZ IV',
      'SOF',
      'OGV',
      'CRANE CORR.',
    ]);
  });

  it('uses the actual vessel name for the load plan sheet, never hard-coded', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    // Load plan is the FIRST sheet so the default-open view in Excel /
    // Numbers lands on the data, not on a possibly-empty SOF.
    expect(wb.worksheets[0]!.name).toBe('KAVKAZ IV');
  });

  it('writes the per-hold values from CalculationService', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.getWorksheet('KAVKAZ IV')!;
    const calc = await new CalculationService(db).calculate(voyageId);

    // Header row at row 6, hold rows start at 7.
    for (let i = 0; i < KAVKAZ_IV_HOLDS.length; i++) {
      const expected = calc.holds[i]!;
      const actualRow = sheet.getRow(7 + i);
      expect(actualRow.getCell(1).value).toBe(`№${expected.hold_no}`);
      expect(actualRow.getCell(3).value).toBeCloseTo(expected.sf!, 3);
      expect(actualRow.getCell(4).value).toBeCloseTo(expected.volume_m3, 3);
      expect(actualRow.getCell(5).value).toBeCloseTo(expected.loaded_tons, 3);
      expect(actualRow.getCell(7).value).toBeCloseTo(expected.remain_tons, 3);
      expect(actualRow.getCell(8).value).toBeCloseTo(expected.capacity_tons_98!, 3);
      expect(actualRow.getCell(9).value).toBeCloseTo(expected.empty_space_98!, 3);
    }
  });

  it('totals row matches Appendix C aggregates', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.getWorksheet('KAVKAZ IV')!;
    const totalsRowNum = 7 + KAVKAZ_IV_HOLDS.length;
    const totalsRow = sheet.getRow(totalsRowNum);

    expect(totalsRow.getCell(1).value).toBe('TOTAL');
    expect(totalsRow.getCell(5).value).toBeCloseTo(KAVKAZ_IV_TOTALS.total_loaded, 3);
    expect(totalsRow.getCell(6).value).toBeCloseTo(KAVKAZ_IV_TOTALS.total_discharged, 3);
    expect(totalsRow.getCell(7).value).toBeCloseTo(KAVKAZ_IV_TOTALS.on_board, 3);
    expect(totalsRow.getCell(9).value).toBeCloseTo(KAVKAZ_IV_TOTALS.total_empty_98, 3);
  });

  it('AT-13: every numeric cell uses 3-decimal format across all sheets', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);

    let numericCells = 0;
    wb.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (typeof cell.value === 'number') {
            numericCells++;
            // Allow "0.000" (tonnage / SF / volume / capacity / coefficient),
            // "0.0" (empty volume %), or "0" (integer Hold # in OGV).
            expect(
              cell.numFmt === '0.000' ||
                cell.numFmt === '0.0' ||
                cell.numFmt === '0',
            ).toBe(true);
          }
        });
      });
    });
    expect(numericCells).toBeGreaterThan(0);
  });

  it('contains no formula cells across all sheets (TZ §6 FR-22 / §8 rule 16)', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    wb.eachSheet((sheet) => {
      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          if (
            cell.value !== null &&
            typeof cell.value === 'object' &&
            'formula' in (cell.value as object)
          ) {
            throw new Error(`Found formula at ${sheet.name}!${cell.address}`);
          }
        });
      });
    });
  });

  it('SOF sheet contains the events inserted via SofService', async () => {
    const sof = new SofService(db);
    await sof.create({
      voyage_id: voyageId,
      event_date: '2026-04-30',
      time_from: '08:00',
      time_to: '12:00',
      category: 'Arrival',
      description: 'Vessel arrived at anchorage',
    });
    await sof.create({
      voyage_id: voyageId,
      event_date: '2026-05-01',
      time_from: '06:30',
      time_to: '08:00',
      category: 'NOR',
      description: 'Notice of Readiness tendered',
      daily_qty: 100,
      total_qty: 100,
    });

    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.getWorksheet('SOF')!;

    // Header row.
    expect(sheet.getRow(1).getCell(1).value).toBe('Date');
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet.getRow(1).getCell(7).value).toBe('Total Qty');

    // Events sorted by (event_date, time_from).
    const r2 = sheet.getRow(2);
    expect(r2.getCell(1).value).toBe('2026-04-30');
    expect(r2.getCell(2).value).toBe('08:00');
    expect(r2.getCell(4).value).toBe('Arrival');
    expect(r2.getCell(5).value).toBe('Vessel arrived at anchorage');

    const r3 = sheet.getRow(3);
    expect(r3.getCell(1).value).toBe('2026-05-01');
    expect(r3.getCell(2).value).toBe('06:30');
    expect(r3.getCell(4).value).toBe('NOR');
    expect(r3.getCell(6).value).toBeCloseTo(100, 3);
    expect(r3.getCell(7).value).toBeCloseTo(100, 3);
  });

  it('OGV sheet contains the discharges from the KAVKAZ_IV fixture', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.getWorksheet('OGV')!;

    // Header.
    expect(sheet.getRow(1).getCell(1).value).toBe('Date');
    expect(sheet.getRow(1).getCell(4).value).toBe('Source Vessel');
    expect(sheet.getRow(1).getCell(5).value).toBe('Hold #');
    expect(sheet.getRow(1).getCell(6).value).toBe('Discharged Tons');
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);

    // Two discharges in fixture: hold 3 → 1177 t and hold 5 → 824 t,
    // both dated 2026-05-01, both from source 'AGG'. Sort key is
    // (event_date, source_vessel, time_from, hold_no), so hold 3 first.
    const r2 = sheet.getRow(2);
    expect(r2.getCell(1).value).toBe('2026-05-01');
    expect(r2.getCell(4).value).toBe('AGG');
    expect(r2.getCell(5).value).toBe(3);
    expect(r2.getCell(6).value).toBeCloseTo(1177, 3);

    const r3 = sheet.getRow(3);
    expect(r3.getCell(1).value).toBe('2026-05-01');
    expect(r3.getCell(4).value).toBe('AGG');
    expect(r3.getCell(5).value).toBe(5);
    expect(r3.getCell(6).value).toBeCloseTo(824, 3);

    // No fourth row.
    expect(sheet.getRow(4).getCell(1).value).toBeFalsy();
  });

  it('CRANE CORR. sheet keeps both header rows when nothing is recorded', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.getWorksheet('CRANE CORR.')!;

    const labels = (n: number): unknown[] => Array.from({ length: 9 }, (_, i) => sheet.getRow(n).getCell(i + 1).value ?? null);
    expect(labels(1)).toEqual([
      'Date', 'Mode', 'Crane', 'Scale Tons', 'Coefficient', 'Corrected Tons', 'Delta Tons', 'Operation', 'Note',
    ]);
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);
    expect(sheet.getRow(2).getCell(1).value).toBeFalsy();
    expect(labels(3).slice(0, 6)).toEqual(['Crane', 'Mode', 'Coefficient', 'Valid From', 'Average', 'Measurements']);
  });

  it('CRANE CORR. sheet: shift lines with scale ÷ k = corrected, a shift total, then working coefficients', async () => {
    const c1 = crypto.randomUUID();
    const c2 = crypto.randomUUID();
    await db.execute(`INSERT INTO cranes (id, name) VALUES (?, 'CRANE # 1'), (?, 'CRANE # 2')`, [c1, c2]);
    const cranes = new CraneShiftService(db);
    await cranes.setWorkingCoefficient({ crane_id: c1, mode: 'direct', coefficient: 1.13, valid_from: '2025-11-09' });
    await cranes.setWorkingCoefficient({ crane_id: c2, mode: 'from_own', coefficient: 0.96, valid_from: '2025-11-17' });
    await cranes.addMeasurement({ crane_id: c1, mode: 'direct', vessel_name: 'LYDIA V', measured_on: '2025-08-28', coefficient: 1.13 });
    await cranes.addMeasurement({ crane_id: c1, mode: 'direct', vessel_name: 'GAMMA', measured_on: '2025-02-14', coefficient: 1.07 });
    const outlier = await cranes.addMeasurement({ crane_id: c1, mode: 'direct', measured_on: '2025-10-19', coefficient: 1.39 });
    await cranes.setMeasurementExcluded(outlier.id, true);
    const [op] = await cranes.listDischargeOperations(voyageId);
    await cranes.recordShift({
      voyage_id: voyageId,
      shift_date: '2026-05-01',
      entries: [
        { crane_id: c2, mode: 'from_own', scale_tons: 824, operation_id: op!.id },
        { crane_id: c1, mode: 'direct', scale_tons: 2154, note: 'ALISA V' },
      ],
    });

    const wb = await loadXlsx(await new DocumentEngine(db).generateLoadPlan(voyageId));
    const sheet = wb.getWorksheet('CRANE CORR.')!;

    const fromOwn = sheet.getRow(2);
    expect(fromOwn.getCell(1).value).toBe('2026-05-01');
    expect(fromOwn.getCell(2).value).toBe('From own holds');
    expect(fromOwn.getCell(3).value).toBe('CRANE # 2');
    expect(fromOwn.getCell(5).value).toBe(0.96);
    expect(fromOwn.getCell(6).value).toBeCloseTo(858.333, 3);
    expect(String(fromOwn.getCell(8).value)).toMatch(/^2026-05-01 · Hold \d$/);

    const direct = sheet.getRow(3);
    expect(direct.getCell(2).value).toBe('Direct transfer');
    expect(direct.getCell(4).value).toBe(2154);
    expect(direct.getCell(6).value).toBeCloseTo(1906.195, 3);
    expect(direct.getCell(7).value).toBeCloseTo(-247.805, 3);
    expect(direct.getCell(9).value).toBe('ALISA V');
    for (const col of [4, 5, 6, 7]) expect(direct.getCell(col).numFmt).toBe('0.000');

    const total = sheet.getRow(4);
    expect(total.getCell(2).value).toBe('TOTAL');
    expect(total.getCell(4).value).toBe(2978);
    expect(total.getCell(6).value).toBeCloseTo(2764.528, 3);
    expect(total.getCell(2).font?.bold).toBe(true);

    expect(sheet.getRow(6).getCell(1).value).toBe('Crane');
    const w1 = sheet.getRow(7);
    expect([w1.getCell(1).value, w1.getCell(2).value, w1.getCell(3).value, w1.getCell(4).value]).toEqual([
      'CRANE # 1', 'Direct transfer', 1.13, '2025-11-09',
    ]);
    expect(w1.getCell(5).value).toBeCloseTo(1.1, 9);
    expect(w1.getCell(6).value).toBe('2 / 3');
    expect(sheet.getRow(8).getCell(1).value).toBe('CRANE # 2');
    expect(sheet.getRow(8).getCell(5).value).toBeFalsy();
  });

  it('throws on unknown voyage id', async () => {
    await expect(
      new DocumentEngine(db).generateLoadPlan('does-not-exist'),
    ).rejects.toThrow(/not found/);
  });
});

describe('DocumentEngine — protein in the Load Plan hold table (FR-19, D7)', () => {
  let db: NodeDb;

  beforeEach(async () => {
    db = await openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it.each([
    [10.5, 'WHEAT 10.5%'],
    [11.5, 'WHEAT 11.5%'],
    [12.5, 'WHEAT 12.5%'],
    [13.5, 'WHEAT 13.5%'],
    [null, 'WHEAT'],
  ])('protein %s → "%s" under Cargo / Protein', async (protein, expected) => {
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1], cargoName: 'WHEAT' });
    const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: seed.vesselId, voyage_no: 'P-1' });
    await new CargoLotService(db).add({
      voyage_id: voyage.id,
      source_vessel: 'DIANA MARIA',
      cargo_id: seed.cargoId,
      hold_id: seed.holdIds[0]!,
      protein_percent: protein,
      sf: 1.25,
      planned_tons: 1000,
      loaded_tons: 1000,
    });

    const wb = await loadXlsx(await new DocumentEngine(db).generateLoadPlan(voyage.id));
    const sheet = wb.worksheets[0]!;
    expect(sheet.getCell(6, 2).value).toBe('Cargo / Protein');
    expect(sheet.getCell(7, 1).value).toBe('№1');
    expect(sheet.getCell(7, 2).value).toBe(expected);
  });
});
