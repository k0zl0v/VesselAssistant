import ExcelJS from 'exceljs';
import { CalculationService } from './CalculationService';
import { VoyageService } from './VoyageService';
import type { Db } from './db';

const NUM_FMT = '0.000';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE9ECF1' },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF1F5FB' },
};

/**
 * Generates printable documents from a voyage. Output is a byte array
 * that the caller writes to disk (e.g. via Tauri's plugin-fs).
 *
 * Excel output rules (TZ §6 FR-22, §8 rule 16, excel-export skill):
 *  - No formulas — only computed values.
 *  - All numeric cells use number format "0.000" (3 decimals).
 *  - Sheet name and headers use the actual vessel name; "KAVKAZ IV"
 *    is never hard-coded.
 *  - Original `KAVKAZ IV` Excel structure is approximated: a header
 *    block (vessel / voyage / ports), the per-hold table, and a
 *    totals row.
 */
export class DocumentEngine {
  constructor(private readonly db: Db) {}

  async generateLoadPlan(voyage_id: string): Promise<Uint8Array> {
    const voyage = await new VoyageService(this.db).get(voyage_id);
    if (!voyage) throw new Error(`Voyage ${voyage_id} not found`);

    const vesselRows = await this.db.select<{
      name: string;
      flag: string | null;
    }>(`SELECT name, flag FROM vessels WHERE id = ?`, [voyage.vessel_id]);
    const vessel = vesselRows[0];
    if (!vessel) throw new Error(`Vessel ${voyage.vessel_id} missing`);

    const portRows = await this.db.select<{ name: string }>(
      `SELECT name FROM ports WHERE id IN (?, ?)`,
      [
        voyage.loading_port_id ?? '',
        voyage.discharging_port_id ?? '',
      ],
    );
    const portNames = new Map(portRows.map((p, i) => [i, p.name]));

    const calc = await new CalculationService(this.db).calculate(voyage_id);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'VesselAssistant';
    wb.created = new Date();

    const sheet = wb.addWorksheet(safeSheetName(vessel.name));

    sheet.columns = [
      { width: 8 },
      { width: 14 },
      { width: 11 },
      { width: 8 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 13 },
      { width: 13 },
      { width: 13 },
    ];

    // ── Header block ────────────────────────────────────────────────
    sheet.getCell('A1').value = `m/v ${vessel.name}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.mergeCells('A1:D1');

    sheet.getCell('A2').value = `Flag: ${vessel.flag ?? '—'}`;
    sheet.getCell('A3').value = `Voyage No: ${voyage.voyage_no}`;
    sheet.getCell('A4').value = `Status: ${voyage.status}`;
    sheet.getCell('F2').value = `Loading port: ${portNames.get(0) ?? '—'}`;
    sheet.getCell('F3').value = `Discharging port: ${portNames.get(1) ?? '—'}`;
    sheet.getCell('F4').value = `Generated: ${new Date().toISOString()}`;

    // ── Hold table ──────────────────────────────────────────────────
    const HEADER_ROW = 6;
    const headers = [
      'Hold',
      'Cargo / Protein',
      'SF',
      'Volume m³',
      'Loaded',
      'Discharged',
      'Remain',
      'Capacity 98%',
      'Empty 98%',
      'Empty Vol %',
    ];
    headers.forEach((label, i) => {
      const cell = sheet.getCell(HEADER_ROW, i + 1);
      cell.value = label;
      cell.font = { bold: true };
      cell.alignment = { horizontal: i === 0 || i === 1 ? 'left' : 'right' };
      cell.fill = HEADER_FILL;
      cell.border = { bottom: { style: 'thin' } };
    });

    // Look up cargo + protein hints per hold via hold_cargo_parameters.
    const cargoLines = await this.db.select<{
      hold_id: string;
      cargo_name: string;
      protein_percent: number | null;
    }>(
      `SELECT hp.hold_id AS hold_id, c.name AS cargo_name, hp.protein_percent
         FROM hold_cargo_parameters hp
         JOIN cargoes c ON c.id = hp.cargo_id
        WHERE hp.voyage_id = ?`,
      [voyage_id],
    );
    const cargoByHold = new Map<string, string>();
    for (const r of cargoLines) {
      const proteinSuffix =
        r.protein_percent === null ? '' : ` ${r.protein_percent.toFixed(1)}%`;
      cargoByHold.set(r.hold_id, `${r.cargo_name}${proteinSuffix}`);
    }

    let rowNum = HEADER_ROW + 1;
    for (const h of calc.holds) {
      const r = sheet.getRow(rowNum);
      r.getCell(1).value = `№${h.hold_no}`;
      r.getCell(2).value = cargoByHold.get(h.hold_id) ?? '—';
      r.getCell(3).value = h.sf;
      r.getCell(4).value = h.volume_m3;
      r.getCell(5).value = h.loaded_tons;
      r.getCell(6).value = h.discharged_tons;
      r.getCell(7).value = h.remain_tons;
      r.getCell(8).value = h.capacity_tons_98;
      r.getCell(9).value = h.empty_space_98;
      r.getCell(10).value = h.empty_volume_percent;
      for (let c = 3; c <= 10; c++) {
        r.getCell(c).numFmt = NUM_FMT;
        r.getCell(c).alignment = { horizontal: 'right' };
      }
      r.getCell(10).numFmt = '0.0';
      rowNum++;
    }

    // ── Totals row ─────────────────────────────────────────────────
    const totalsRow = sheet.getRow(rowNum);
    totalsRow.getCell(1).value = 'TOTAL';
    totalsRow.getCell(1).font = { bold: true };
    totalsRow.getCell(5).value = calc.totals.total_loaded;
    totalsRow.getCell(6).value = calc.totals.total_discharged;
    totalsRow.getCell(7).value = calc.totals.on_board;
    totalsRow.getCell(8).value = null;
    totalsRow.getCell(9).value = calc.totals.total_empty_98;
    for (let c = 5; c <= 9; c++) {
      totalsRow.getCell(c).numFmt = NUM_FMT;
      totalsRow.getCell(c).alignment = { horizontal: 'right' };
      totalsRow.getCell(c).font = { bold: true };
      totalsRow.getCell(c).fill = TOTAL_FILL;
      totalsRow.getCell(c).border = { top: { style: 'thin' } };
    }
    rowNum += 2;

    // ── Aggregate footer ──────────────────────────────────────────
    sheet.getCell(rowNum, 1).value = 'On Board';
    sheet.getCell(rowNum, 2).value = calc.totals.on_board;
    sheet.getCell(rowNum + 1, 1).value = 'Discharged';
    sheet.getCell(rowNum + 1, 2).value = calc.totals.total_discharged;
    sheet.getCell(rowNum + 2, 1).value = 'Total Empty Space 100%';
    sheet.getCell(rowNum + 2, 2).value = calc.totals.total_empty_100;
    sheet.getCell(rowNum + 3, 1).value = 'Total Empty Space 98%';
    sheet.getCell(rowNum + 3, 2).value = calc.totals.total_empty_98;
    for (let i = 0; i < 4; i++) {
      sheet.getCell(rowNum + i, 2).numFmt = NUM_FMT;
      sheet.getCell(rowNum + i, 2).alignment = { horizontal: 'right' };
    }

    // Critical: assert no formulas leaked in.
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (
          cell.value !== null &&
          typeof cell.value === 'object' &&
          'formula' in (cell.value as object)
        ) {
          throw new Error(
            `Cell ${cell.address} contains a formula — exports must be values only`,
          );
        }
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new Uint8Array(buffer);
  }
}

/** Excel sheet name limits: max 31 chars, no [ ] : * ? / \ */
function safeSheetName(name: string): string {
  return name.replace(/[\[\]:*?/\\]/g, '_').slice(0, 31);
}
