import ExcelJS from 'exceljs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalculationService } from '../CalculationService';
import { CargoLotService } from '../CargoLotService';
import { DocumentEngine } from '../DocumentEngine';
import { OgvService } from '../OgvService';
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

  it('uses the actual vessel name for the sheet, never hard-coded', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    expect(wb.worksheets).toHaveLength(1);
    expect(wb.worksheets[0]!.name).toBe('KAVKAZ IV');
  });

  it('writes the per-hold values from CalculationService', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.worksheets[0]!;
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
    const sheet = wb.worksheets[0]!;
    const totalsRowNum = 7 + KAVKAZ_IV_HOLDS.length;
    const totalsRow = sheet.getRow(totalsRowNum);

    expect(totalsRow.getCell(1).value).toBe('TOTAL');
    expect(totalsRow.getCell(5).value).toBeCloseTo(KAVKAZ_IV_TOTALS.total_loaded, 3);
    expect(totalsRow.getCell(6).value).toBeCloseTo(KAVKAZ_IV_TOTALS.total_discharged, 3);
    expect(totalsRow.getCell(7).value).toBeCloseTo(KAVKAZ_IV_TOTALS.on_board, 3);
    expect(totalsRow.getCell(9).value).toBeCloseTo(KAVKAZ_IV_TOTALS.total_empty_98, 3);
  });

  it('AT-13: every numeric cell uses 3-decimal format', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.worksheets[0]!;

    let numericCells = 0;
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === 'number') {
          numericCells++;
          // Allow either "0.000" (default for tonnage / SF / volume / capacity)
          // or "0.0" (used for empty volume %).
          expect(cell.numFmt === '0.000' || cell.numFmt === '0.0').toBe(true);
        }
      });
    });
    expect(numericCells).toBeGreaterThan(0);
  });

  it('contains no formula cells (TZ §6 FR-22 / §8 rule 16)', async () => {
    const bytes = await new DocumentEngine(db).generateLoadPlan(voyageId);
    const wb = await loadXlsx(bytes);
    const sheet = wb.worksheets[0]!;
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (
          cell.value !== null &&
          typeof cell.value === 'object' &&
          'formula' in (cell.value as object)
        ) {
          throw new Error(`Found formula at ${cell.address}`);
        }
      });
    });
  });

  it('throws on unknown voyage id', async () => {
    await expect(
      new DocumentEngine(db).generateLoadPlan('does-not-exist'),
    ).rejects.toThrow(/not found/);
  });
});
