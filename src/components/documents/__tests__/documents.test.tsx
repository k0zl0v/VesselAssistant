/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import ExcelJS from 'exceljs';
import { formatTons } from '../../../calc/round';
import { KAVKAZ_IV_HOLDS } from '../../../fixtures/kavkaz-iv';
import { CalculationService } from '../../../services/CalculationService';
import { CargoLotService } from '../../../services/CargoLotService';
import { DocumentEngine } from '../../../services/DocumentEngine';
import { VoyageService } from '../../../services/VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb } from '../../../services/__tests__/helpers';
import type { NodeDb } from '../../../services/db-node';
import { loadCargoByHold } from '../cargoByHold';
import { LoadPlanPreview } from '../LoadPlanPreview';
import { sheetName, workbookSheets } from '../sheets';
import { defaultExportFileName } from '../useWorkbookExport';

/** Appendix C load (holds 1–5, one lot each) on a vessel that is not KAVKAZ IV. */
async function seed(db: NodeDb): Promise<string> {
  const vesselId = crypto.randomUUID();
  await db.execute(`INSERT INTO vessels (id, name) VALUES (?, 'NORD STAR')`, [vesselId]);
  const cargoIds = { SFM: crypto.randomUUID(), WHEAT: crypto.randomUUID() };
  for (const [name, id] of Object.entries(cargoIds)) {
    await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [id, name]);
  }
  const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: vesselId, voyage_no: 'NS-01' });
  for (const h of KAVKAZ_IV_HOLDS) {
    const holdId = crypto.randomUUID();
    await db.execute(`INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`, [
      holdId, vesselId, h.hold_no, h.volume_m3,
    ]);
    await new CargoLotService(db).add({
      voyage_id: voyage.id,
      hold_id: holdId,
      cargo_id: cargoIds[h.cargo],
      source_vessel: `BARGE ${h.hold_no}`,
      sf: h.sf,
      planned_tons: h.loaded_tons,
      loaded_tons: h.loaded_tons,
      protein_percent: h.cargo === 'WHEAT' ? 12.5 : null,
    });
  }
  return voyage.id;
}

describe('Documents screen pieces', () => {
  let db: NodeDb;

  beforeEach(async () => {
    db = await openTestDb();
  });

  afterEach(() => {
    cleanup();
    db.close();
  });

  it('default file name and sheet order come from the vessel name, never a constant', () => {
    expect(defaultExportFileName('NORD STAR', 'NS/01')).toBe('Load Plan NORD STAR NS_01.xlsx');
    expect(workbookSheets('NORD STAR').map((s) => s.name)).toEqual(['NORD STAR', 'SOF', 'OGV', 'CRANE CORR.']);
    expect(sheetName('A/B:C [x]')).toBe('A_B_C _x_');
    expect(sheetName('X'.repeat(40))).toHaveLength(31);
  });

  it('preview shows the same per-hold and total values the XLSX Load Plan sheet writes', async () => {
    const voyageId = await seed(db);
    const calc = await new CalculationService(db).calculate(voyageId);
    const cargo = await loadCargoByHold(db, voyageId);
    render(
      <LoadPlanPreview
        vessel_name="NORD STAR"
        voyage_no="NS-01"
        route=""
        asOf="27.09.2026"
        calc={calc}
        cargoByHold={cargo}
        sheets={workbookSheets('NORD STAR')}
      />,
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await new DocumentEngine(db).generateLoadPlan(voyageId)).buffer as ArrayBuffer);
    const sheet = wb.worksheets[0]!;
    expect(sheet.name).toBe('NORD STAR');

    const rows = screen.getAllByTestId('documents-preview-row');
    expect(rows).toHaveLength(5);
    rows.forEach((row, i) => {
      const xlsx = sheet.getRow(7 + i);
      const cells = within(row).getAllByRole('cell').map((c) => c.textContent);
      expect(cells[0]).toBe(xlsx.getCell(1).value);
      expect(cells[1]).toBe(xlsx.getCell(2).value);
      for (const col of [3, 4, 5, 6, 7, 8, 9]) {
        expect(cells[col - 1]).toBe(formatTons(xlsx.getCell(col).value as number));
      }
    });
    expect(within(rows[1]!).getAllByRole('cell')[1]!.textContent).toBe('WHEAT 12.5%');

    const total = within(screen.getByTestId('documents-preview-total')).getAllByRole('cell').map((c) => c.textContent);
    const xlsxTotal = sheet.getRow(12);
    expect(xlsxTotal.getCell(1).value).toBe('TOTAL');
    expect(total.slice(1, 4)).toEqual([5, 6, 7].map((c) => formatTons(xlsxTotal.getCell(c).value as number)));
    expect(total[5]).toBe(formatTons(xlsxTotal.getCell(9).value as number));
    expect(total[1]).toBe('25\u202F684.955');
    expect(screen.getByTestId('documents-preview-heading').textContent).toBe('NORD STAR — LOAD / STOWAGE PLAN');
  });
});
