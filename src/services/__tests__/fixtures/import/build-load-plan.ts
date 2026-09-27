import ExcelJS from 'exceljs';
import { KAVKAZ_IV_HOLDS, KAVKAZ_IV_VESSEL_NAME } from '../../../../fixtures/kavkaz-iv';

/** Bottom-table columns per hold, as in the original sheet (holds 5..1 left to right). */
const BOTTOM_COLUMN_BY_HOLD: Readonly<Record<number, string>> = { 1: 'K', 2: 'I', 3: 'G', 4: 'E', 5: 'C' };

/**
 * Rebuilds the Load St Plan workbook layout that ImportService.parseLoadPlan reads
 * (see the layout comment in src/services/ImportService.ts) from the Appendix C
 * values in src/fixtures/kavkaz-iv.ts. Plain values only — no formula cells.
 * `appendix-c-load-plan.xlsx` is this workbook written by scripts/generate-import-fixture.ts.
 */
export function buildLoadPlanWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'scripts/generate-import-fixture.ts';
  wb.created = new Date('2026-01-01T00:00:00Z');
  wb.modified = wb.created;

  // The original file opens on a SOF tab; the parser must skip it.
  wb.addWorksheet('SOF').getCell('A1').value = 'STATEMENT OF FACTS';

  const ws = wb.addWorksheet(KAVKAZ_IV_VESSEL_NAME);
  ws.getCell('B2').value = `m/v ${KAVKAZ_IV_VESSEL_NAME}`;
  ws.getCell('B25').value = 'Loaded';
  ws.getCell('B26').value = 'Discharged';
  ws.getCell('B27').value = 'Remain';

  KAVKAZ_IV_HOLDS.forEach((h, i) => {
    const row = 4 + i;
    ws.getCell(`O${row}`).value = h.sf;
    ws.getCell(`P${row}`).value = h.hold_no;
    ws.getCell(`Q${row}`).value = h.volume_m3;
    ws.getCell(`R${row}`).value = h.expected.remain_tons;
    ws.getCell(`T${row}`).value = h.cargo;

    const col = BOTTOM_COLUMN_BY_HOLD[h.hold_no];
    if (!col) throw new Error(`no bottom-table column for hold ${h.hold_no}`);
    ws.getCell(`${col}25`).value = h.loaded_tons;
    ws.getCell(`${col}26`).value = h.discharged_tons;
    ws.getCell(`${col}27`).value = h.expected.remain_tons;
  });

  wb.addWorksheet('OGV');
  wb.addWorksheet('CRANE CORR.');
  return wb;
}

export type CellDump = Record<string, string | number | boolean | null>;

/** Sheet name → non-empty cell values by address; what "same fixture" means for the freshness test. */
export function dumpWorkbook(wb: ExcelJS.Workbook): Record<string, CellDump> {
  const out: Record<string, CellDump> = {};
  for (const ws of wb.worksheets) {
    const cells: CellDump = {};
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        const v = cell.value;
        cells[cell.address] =
          v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
            ? v
            : JSON.stringify(v);
      });
    });
    out[ws.name] = cells;
  }
  return out;
}
