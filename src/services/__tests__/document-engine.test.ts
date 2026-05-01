import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalculationService } from '../CalculationService';
import { CargoLotService } from '../CargoLotService';
import { CraneCorrectionService } from '../CraneCorrectionService';
import { DocumentEngine } from '../DocumentEngine';
import { OgvService } from '../OgvService';
import { SofService } from '../SofService';
import { VoyageService } from '../VoyageService';
import { KAVKAZ_IV_HOLDS, KAVKAZ_IV_TOTALS } from '../../fixtures/kavkaz-iv';
import { openTestDb } from './helpers';
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

    const voyage = await new VoyageService(db).create({
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
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      'SOF',
      'KAVKAZ IV',
      'OGV',
      'CRANE CORR.',
    ]);
  });

  it('uses the actual vessel name for the load plan sheet, never hard-coded', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    // Load plan is the second sheet now.
    expect(wb.worksheets[1]!.name).toBe('KAVKAZ IV');
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

  it('CRANE CORR. sheet exists with header even when no coefficients seeded', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.getWorksheet('CRANE CORR.')!;

    expect(sheet.getRow(1).getCell(1).value).toBe('Crane');
    expect(sheet.getRow(1).getCell(2).value).toBe('Operation Type');
    expect(sheet.getRow(1).getCell(3).value).toBe('Side');
    expect(sheet.getRow(1).getCell(4).value).toBe('Vessel');
    expect(sheet.getRow(1).getCell(5).value).toBe('Valid From');
    expect(sheet.getRow(1).getCell(6).value).toBe('Valid To');
    expect(sheet.getRow(1).getCell(7).value).toBe('Coefficient');
    expect(sheet.getRow(1).getCell(1).font?.bold).toBe(true);

    // No data rows.
    expect(sheet.getRow(2).getCell(1).value).toBeFalsy();
  });

  it('CRANE CORR. sheet renders seeded coefficients with 0.000 format', async () => {
    const craneId = crypto.randomUUID();
    await db.execute(`INSERT INTO cranes (id, name) VALUES (?, ?)`, [
      craneId,
      'Liebherr-1',
    ]);
    await new CraneCorrectionService(db).create({
      crane_id: craneId,
      operation_type: 'discharging',
      side: 'PORT',
      vessel_name: 'KAVKAZ IV',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
      coefficient: 1.025,
    });

    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.getWorksheet('CRANE CORR.')!;

    const r2 = sheet.getRow(2);
    expect(r2.getCell(1).value).toBe('Liebherr-1');
    expect(r2.getCell(2).value).toBe('discharging');
    expect(r2.getCell(3).value).toBe('PORT');
    expect(r2.getCell(4).value).toBe('KAVKAZ IV');
    expect(r2.getCell(5).value).toBe('2026-01-01');
    expect(r2.getCell(6).value).toBe('2026-12-31');
    expect(r2.getCell(7).value).toBeCloseTo(1.025, 3);
    expect(r2.getCell(7).numFmt).toBe('0.000');
  });

  it('throws on unknown voyage id', async () => {
    await expect(
      new DocumentEngine(db).generateLoadPlan('does-not-exist'),
    ).rejects.toThrow(/not found/);
  });
});
