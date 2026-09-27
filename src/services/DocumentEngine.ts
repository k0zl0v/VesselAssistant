import ExcelJS from 'exceljs';
import { AuditLogService } from './AuditLogService';
import { CalculationService } from './CalculationService';
import { AppError } from './errors';
import { SofService } from './SofService';
import type { Db } from './db';
import type { Voyage } from './types';

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
 *  - All numeric cells use number format "0.000" (3 decimals)
 *    or "0.0" for percentages.
 *  - Sheet name and headers use the actual vessel name; "KAVKAZ IV"
 *    is never hard-coded.
 *  - The workbook mirrors the original template with four sheets
 *    in this order: SOF, (vessel name), OGV, CRANE CORR.
 */
export class DocumentEngine {
  constructor(private readonly db: Db) {}

  async generateLoadPlan(voyage_id: string): Promise<Uint8Array> {
    const [voyage] = await this.db.select<Voyage>(`SELECT * FROM voyages WHERE id = ?`, [voyage_id]);
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
    const cargoByHold = await this.loadCargoByHold(voyage_id);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'VesselAssistant';
    wb.created = new Date();

    // ── Sheet 1: (vessel name) load plan ─────────────────────────────
    // Put the Load Plan first so it's what opens by default in Excel /
    // Numbers — SOF / OGV / Crane Corr can be empty for fresh voyages
    // and an empty first sheet looks like a broken export.
    this.buildLoadPlanSheet(wb, vessel, voyage, portNames, calc, cargoByHold);

    // ── Sheet 2: SOF ─────────────────────────────────────────────────
    await this.buildSofSheet(wb, voyage_id);

    // ── Sheet 3: OGV ─────────────────────────────────────────────────
    await this.buildOgvSheet(wb, voyage_id);

    // ── Sheet 4: CRANE CORR. ─────────────────────────────────────────
    await this.buildCraneCorrSheet(wb);

    assertNoFormulas(wb);
    const buffer = await wb.xlsx.writeBuffer();
    return new Uint8Array(buffer);
  }

  /** FR-10: one voyage's audit trail as a single-sheet XLSX, raw JSON snapshots kept verbatim. */
  async generateAuditLog(voyage_id: string): Promise<Uint8Array> {
    const [voyage] = await this.db.select<{ voyage_no: string; vessel_name: string }>(
      `SELECT v.voyage_no AS voyage_no, vs.name AS vessel_name
         FROM voyages v JOIN vessels vs ON vs.id = v.vessel_id
        WHERE v.id = ?`,
      [voyage_id],
    );
    if (!voyage) throw new AppError('voyage.not_found', { voyage_id });
    const entries = await new AuditLogService(this.db).listForVoyage(voyage_id);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'VesselAssistant';
    wb.created = new Date();
    const sheet = wb.addWorksheet(safeSheetName('AUDIT LOG'));
    sheet.columns = [
      { width: 20 }, // Time
      { width: 22 }, // Entity
      { width: 38 }, // Entity ID
      { width: 8 },  // Action
      { width: 16 }, // Operator
      { width: 12 }, // Role
      { width: 28 }, // Reason
      { width: 60 }, // Old value
      { width: 60 }, // New value
    ];

    sheet.getCell('A1').value = `Audit log — m/v ${voyage.vessel_name}, Voyage No ${voyage.voyage_no}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };
    sheet.getCell('A2').value = `Generated: ${new Date().toISOString()}`;

    const HEADER_ROW = 4;
    const headers = [
      'Time',
      'Entity',
      'Entity ID',
      'Action',
      'Operator',
      'Role',
      'Reason',
      'Old value',
      'New value',
    ];
    headers.forEach((label, i) => {
      const cell = sheet.getCell(HEADER_ROW, i + 1);
      cell.value = label;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: 'left' };
      cell.border = { bottom: { style: 'thin' } };
    });

    entries.forEach((e, i) => {
      sheet.getRow(HEADER_ROW + 1 + i).values = [
        e.created_at,
        e.entity_type,
        e.entity_id,
        e.action,
        e.user_id ?? '',
        e.user_role ?? '',
        e.reason ?? '',
        e.old_value ?? '',
        e.new_value ?? '',
      ];
    });

    assertNoFormulas(wb);
    const buffer = await wb.xlsx.writeBuffer();
    return new Uint8Array(buffer);
  }

  // ───────────────────────────────────────────────────────────────────
  // Sheet builders
  // ───────────────────────────────────────────────────────────────────

  private async buildSofSheet(
    wb: ExcelJS.Workbook,
    voyage_id: string,
  ): Promise<void> {
    const sheet = wb.addWorksheet(safeSheetName('SOF'));
    sheet.columns = [
      { width: 12 }, // Date
      { width: 8 },  // From
      { width: 8 },  // To
      { width: 16 }, // Category
      { width: 40 }, // Description
      { width: 12 }, // Daily Qty
      { width: 12 }, // Total Qty
    ];

    const headers = [
      'Date',
      'From',
      'To',
      'Category',
      'Description',
      'Daily Qty',
      'Total Qty',
    ];
    headers.forEach((label, i) => {
      const cell = sheet.getCell(1, i + 1);
      cell.value = label;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: i <= 4 ? 'left' : 'right' };
      cell.border = { bottom: { style: 'thin' } };
    });

    const events = await new SofService(this.db).list(voyage_id);
    let rowNum = 2;
    for (const ev of events) {
      const r = sheet.getRow(rowNum);
      r.getCell(1).value = ev.event_date;
      r.getCell(2).value = ev.time_from ?? '';
      r.getCell(3).value = ev.time_to ?? '';
      r.getCell(4).value = ev.category ?? '';
      r.getCell(5).value = ev.description ?? '';
      if (ev.daily_qty !== null && ev.daily_qty !== undefined) {
        r.getCell(6).value = ev.daily_qty;
        r.getCell(6).numFmt = NUM_FMT;
        r.getCell(6).alignment = { horizontal: 'right' };
      }
      if (ev.total_qty !== null && ev.total_qty !== undefined) {
        r.getCell(7).value = ev.total_qty;
        r.getCell(7).numFmt = NUM_FMT;
        r.getCell(7).alignment = { horizontal: 'right' };
      }
      rowNum++;
    }
  }

  private buildLoadPlanSheet(
    wb: ExcelJS.Workbook,
    vessel: { name: string; flag: string | null },
    voyage: { voyage_no: string; status: string },
    portNames: Map<number, string>,
    calc: Awaited<ReturnType<CalculationService['calculate']>>,
    cargoByHold: Map<string, string>,
  ): void {
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
  }

  /**
   * Per-hold cargo display strings (e.g. "WHEAT 11.5%") looked up
   * from `hold_cargo_parameters` joined to `cargoes`.
   */
  private async loadCargoByHold(
    voyage_id: string,
  ): Promise<Map<string, string>> {
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
    const out = new Map<string, string>();
    for (const r of cargoLines) {
      const proteinSuffix =
        r.protein_percent === null ? '' : ` ${r.protein_percent.toFixed(1)}%`;
      out.set(r.hold_id, `${r.cargo_name}${proteinSuffix}`);
    }
    return out;
  }

  private async buildOgvSheet(
    wb: ExcelJS.Workbook,
    voyage_id: string,
  ): Promise<void> {
    const sheet = wb.addWorksheet(safeSheetName('OGV'));
    sheet.columns = [
      { width: 12 }, // Date
      { width: 8 },  // Time From
      { width: 8 },  // Time To
      { width: 18 }, // Source Vessel
      { width: 8 },  // Hold #
      { width: 14 }, // Discharged Tons
    ];

    const headers = [
      'Date',
      'Time From',
      'Time To',
      'Source Vessel',
      'Hold #',
      'Discharged Tons',
    ];
    headers.forEach((label, i) => {
      const cell = sheet.getCell(1, i + 1);
      cell.value = label;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: i <= 3 ? 'left' : 'right' };
      cell.border = { bottom: { style: 'thin' } };
    });

    const rows = await this.db.select<{
      event_date: string;
      time_from: string | null;
      time_to: string | null;
      source_vessel: string;
      hold_no: number;
      discharged_tons: number;
    }>(
      `SELECT o.event_date    AS event_date,
              o.time_from     AS time_from,
              o.time_to       AS time_to,
              da.source_vessel AS source_vessel,
              h.hold_no       AS hold_no,
              da.discharged_tons AS discharged_tons
         FROM discharge_allocations da
         JOIN operations o ON o.id = da.operation_id
         JOIN holds      h ON h.id = da.hold_id
        WHERE o.voyage_id = ?
        ORDER BY o.event_date,
                 da.source_vessel,
                 CASE WHEN o.time_from IS NULL THEN 1 ELSE 0 END,
                 o.time_from,
                 h.hold_no`,
      [voyage_id],
    );

    let rowNum = 2;
    for (const r of rows) {
      const row = sheet.getRow(rowNum);
      row.getCell(1).value = r.event_date;
      row.getCell(2).value = r.time_from ?? '';
      row.getCell(3).value = r.time_to ?? '';
      row.getCell(4).value = r.source_vessel;
      row.getCell(5).value = r.hold_no;
      row.getCell(6).value = r.discharged_tons;
      row.getCell(5).alignment = { horizontal: 'right' };
      row.getCell(5).numFmt = '0';
      row.getCell(6).numFmt = NUM_FMT;
      row.getCell(6).alignment = { horizontal: 'right' };
      rowNum++;
    }
  }

  private async buildCraneCorrSheet(wb: ExcelJS.Workbook): Promise<void> {
    const sheet = wb.addWorksheet(safeSheetName('CRANE CORR.'));
    sheet.columns = [
      { width: 16 }, // Crane
      { width: 14 }, // Operation Type
      { width: 12 }, // Side
      { width: 18 }, // Vessel
      { width: 12 }, // Valid From
      { width: 12 }, // Valid To
      { width: 14 }, // Coefficient
    ];

    const headers = [
      'Crane',
      'Operation Type',
      'Side',
      'Vessel',
      'Valid From',
      'Valid To',
      'Coefficient',
    ];
    headers.forEach((label, i) => {
      const cell = sheet.getCell(1, i + 1);
      cell.value = label;
      cell.font = { bold: true };
      cell.fill = HEADER_FILL;
      cell.alignment = { horizontal: i === 6 ? 'right' : 'left' };
      cell.border = { bottom: { style: 'thin' } };
    });

    const rows = await this.db.select<{
      crane_name: string;
      operation_type: string;
      side: string | null;
      vessel_name: string | null;
      valid_from: string;
      valid_to: string | null;
      coefficient: number;
    }>(
      `SELECT cr.name        AS crane_name,
              cc.operation_type AS operation_type,
              cc.side        AS side,
              cc.vessel_name AS vessel_name,
              cc.valid_from  AS valid_from,
              cc.valid_to    AS valid_to,
              cc.coefficient AS coefficient
         FROM crane_coefficients cc
         JOIN cranes cr ON cr.id = cc.crane_id
        ORDER BY cr.name, cc.operation_type, cc.valid_from DESC`,
    );

    let rowNum = 2;
    for (const r of rows) {
      const row = sheet.getRow(rowNum);
      row.getCell(1).value = r.crane_name;
      row.getCell(2).value = r.operation_type;
      row.getCell(3).value = r.side ?? '';
      row.getCell(4).value = r.vessel_name ?? '';
      row.getCell(5).value = r.valid_from;
      row.getCell(6).value = r.valid_to ?? '';
      row.getCell(7).value = r.coefficient;
      row.getCell(7).numFmt = NUM_FMT;
      row.getCell(7).alignment = { horizontal: 'right' };
      rowNum++;
    }
  }
}

/** Last-line defence: exports carry values only, never formulas (TZ §6 FR-22). */
function assertNoFormulas(wb: ExcelJS.Workbook): void {
  wb.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (
          cell.value !== null &&
          typeof cell.value === 'object' &&
          'formula' in (cell.value as object)
        ) {
          throw new Error(
            `Cell ${sheet.name}!${cell.address} contains a formula — exports must be values only`,
          );
        }
      });
    });
  });
}

/** Excel sheet name limits: max 31 chars, no [ ] : * ? / \ */
function safeSheetName(name: string): string {
  return name.replace(/[\[\]:*?/\\]/g, '_').slice(0, 31);
}
