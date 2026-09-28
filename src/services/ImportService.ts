/**
 * FR-12 — Import of "Load Stowage Plan + SOF" XLSX into the local DB.
 *
 * The reference file has the structure:
 *   - Header rows 1-3: vessel name (B2 / B6), voyage no (J3), loading port
 *     (J1), discharging port (J2).
 *   - Rows 4-8 ("top-of-sheet" per-hold table), columns N..T:
 *       N — protein % (FR-19; outside PROTEIN_ALLOWED → the row is rejected)
 *       O — SF
 *       P — hold number (1..5)
 *       Q — volume m³ (formula resolved value)
 *       R — remain tons
 *       T — cargo name (SFM / WHEAT)
 *   - Rows 25/26 ("bottom-of-sheet"), columns C/E/G/I/K → holds 5/4/3/2/1:
 *       row 25: Loaded
 *       row 26: Discharged
 *
 * `parseLoadPlan` is pure: it only reads the bytes and returns structured
 * data. `applyImport` writes the skeleton as one `executeBatch`, then lots and
 * discharges through their own atomic services.
 */

import ExcelJS from 'exceljs';
import type { AutoBackupHook } from './AutoBackupService';
import { CargoLotService } from './CargoLotService';
import { OgvService } from './OgvService';
import type { BatchStatement, Db } from './db';
import { AppError } from './errors';
import { PROTEIN_ALLOWED } from './types';

export interface ParsedHold {
  hold_no: number;
  volume_m3: number;
  sf: number;
  cargo_name: string;
  loaded_tons: number;
  discharged_tons: number;
  protein_percent: number | null;
  /** Address of the protein cell (`N<row>`), null when the hold has no top-table row. */
  protein_cell: string | null;
}

/** A spreadsheet row `applyImport` refused; `error` renders through `describeError`. */
export interface ImportRowError {
  sheet: string;
  cell: string;
  hold_no: number;
  error: AppError;
}

export interface ImportResult {
  voyage_id: string;
  rejected: ImportRowError[];
}

export interface ParsedLoadPlan {
  sheet_name: string;
  vessel_name: string;
  voyage_no: string | null;
  loading_port: string | null;
  discharging_port: string | null;
  holds: ParsedHold[];
}

/** Bottom-of-sheet column → hold number mapping. */
const BOTTOM_HOLD_COLUMNS: ReadonlyArray<{ col: string; hold_no: number }> = [
  { col: 'K', hold_no: 1 },
  { col: 'I', hold_no: 2 },
  { col: 'G', hold_no: 3 },
  { col: 'E', hold_no: 4 },
  { col: 'C', hold_no: 5 },
];

const TOP_ROWS: ReadonlyArray<number> = [4, 5, 6, 7, 8];

/**
 * Reads a cell's resolved value: handles plain primitives, formula cells
 * (returns `result`), and rich-text. Returns `null` when the cell is
 * empty or unparseable.
 */
function cellValue(ws: ExcelJS.Worksheet, address: string): unknown {
  const cell = ws.getCell(address);
  const v: unknown = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    const rec = v as Record<string, unknown>;
    if ('result' in rec) return rec.result ?? null;
    if ('richText' in rec && Array.isArray(rec.richText)) {
      return rec.richText.map((r) => (r as { text: string }).text).join('');
    }
    if ('text' in rec) return rec.text;
  }
  return v;
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

/** Strips a leading "m/v " / "M/V " prefix and collapses internal whitespace. */
function cleanVesselName(raw: string): string {
  return raw
    .replace(/^\s*m\/v\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export class ImportService {
  constructor(
    private readonly db: Db,
    private readonly autoBackup: AutoBackupHook,
  ) {}

  /**
   * Parses the bytes of a Load-St-Plan-style XLSX into structured data.
   * Pure — does not touch the DB. Tolerant of missing/empty cells: any
   * field that is unparseable falls back to a sensible default
   * (volume_m3 / sf / loaded / discharged → 0; cargo_name → '';
   * voyage_no / ports → null).
   */
  async parseLoadPlan(bytes: Uint8Array): Promise<ParsedLoadPlan> {
    const wb = new ExcelJS.Workbook();
    // exceljs accepts ArrayBuffer/Buffer here.
    await wb.xlsx.load(
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
    );

    // The reference workbook has 4 sheets (SOF / KAVKAZ IV / OGV / CRANE
    // CORR.). The Load St Plan layout lives on the vessel-named sheet —
    // detect it by scanning for a row 4 that has a hold number in P4 and
    // an SF in O4. This keeps the parser portable across vessel names.
    const ws = pickLoadPlanSheet(wb);

    // Vessel name: try B6 (per the spec), then B2 (where the reference
    // file actually keeps it), then L12 (a header label inside the
    // bottom-table), in that order.
    const vesselRaw =
      asString(cellValue(ws, 'B6')) ??
      asString(cellValue(ws, 'B2')) ??
      asString(cellValue(ws, 'L12')) ??
      'UNKNOWN VESSEL';
    const vessel_name = cleanVesselName(vesselRaw);

    const voyage_no = asString(cellValue(ws, 'J3'));
    const loading_port = asString(cellValue(ws, 'J1'));
    const discharging_port = asString(cellValue(ws, 'J2'));

    // Top-of-sheet per-hold table → SF, volume, cargo name (rows 4..8).
    const topByHold = new Map<
      number,
      { sf: number; volume_m3: number; cargo_name: string; protein_percent: number | null; protein_cell: string }
    >();
    for (const row of TOP_ROWS) {
      const hold_no = asNumber(cellValue(ws, `P${row}`));
      if (hold_no === null) continue;
      const sf = asNumber(cellValue(ws, `O${row}`)) ?? 0;
      const volume_m3 = asNumber(cellValue(ws, `Q${row}`)) ?? 0;
      const cargo_name = asString(cellValue(ws, `T${row}`)) ?? '';
      const protein_cell = `N${row}`;
      const protein_percent = asNumber(cellValue(ws, protein_cell));
      topByHold.set(hold_no, { sf, volume_m3, cargo_name, protein_percent, protein_cell });
    }

    // Bottom-of-sheet: loaded (row 25) and discharged (row 26).
    const bottomByHold = new Map<
      number,
      { loaded_tons: number; discharged_tons: number }
    >();
    for (const { col, hold_no } of BOTTOM_HOLD_COLUMNS) {
      const loaded_tons = asNumber(cellValue(ws, `${col}25`)) ?? 0;
      const discharged_tons = asNumber(cellValue(ws, `${col}26`)) ?? 0;
      bottomByHold.set(hold_no, { loaded_tons, discharged_tons });
    }

    const holdNos = new Set<number>([
      ...topByHold.keys(),
      ...bottomByHold.keys(),
    ]);
    const holds: ParsedHold[] = [...holdNos]
      .sort((a, b) => a - b)
      .map((hold_no) => {
        const top = topByHold.get(hold_no) ?? {
          sf: 0,
          volume_m3: 0,
          cargo_name: '',
          protein_percent: null,
          protein_cell: null,
        };
        const bottom = bottomByHold.get(hold_no) ?? {
          loaded_tons: 0,
          discharged_tons: 0,
        };
        return {
          hold_no,
          volume_m3: top.volume_m3,
          sf: top.sf,
          cargo_name: top.cargo_name,
          loaded_tons: bottom.loaded_tons,
          discharged_tons: bottom.discharged_tons,
          protein_percent: top.protein_percent,
          protein_cell: top.protein_cell,
        };
      });

    return {
      sheet_name: ws.name,
      vessel_name,
      voyage_no,
      loading_port,
      discharging_port,
      holds,
    };
  }

  /**
   * Transactionally applies parsed data to the DB:
   *  - find-or-create vessel (case-insensitive name match)
   *  - find-or-create one hold per parsed hold (existing volume wins)
   *  - find-or-create one cargo per distinct cargo_name
   *  - find-or-create ports (loading + discharging)
   *  - create a new voyage (auto-numbered if voyage_no is null)
   *  - for each hold with loaded_tons > 0 → CargoLotService.add
   *  - for each hold with discharged_tons > 0 → OgvService.discharge
   *
   * A hold row whose protein is outside PROTEIN_ALLOWED is neither loaded nor
   * discharged; it is reported in `rejected`. Returns the new voyage's id.
   */
  async applyImport(parsed: ParsedLoadPlan): Promise<ImportResult> {
    await this.autoBackup.snapshot('import_excel');
    const rejected: ImportRowError[] = [];
    const accepted = parsed.holds.filter((h) => {
      if (h.protein_percent === null || PROTEIN_ALLOWED.includes(h.protein_percent)) return true;
      rejected.push({
        sheet: parsed.sheet_name,
        cell: h.protein_cell ?? '',
        hold_no: h.hold_no,
        error: new AppError('protein.invalid', { value: h.protein_percent }),
      });
      return false;
    });
    const lots = new CargoLotService(this.db);
    const ogv = new OgvService(this.db);

    // Phase 1: reference data + voyage skeleton as one executeBatch so a
    // partial import never leaves a dangling vessel/hold. Lookups run first;
    // only the missing rows become INSERTs in the batch.
    const batch: BatchStatement[] = [];
    const vessel_id = await findOrQueue(this.db, batch, 'vessels', parsed.vessel_name);

    const holdIdByNo = new Map<number, string>();
    for (const h of parsed.holds) {
      holdIdByNo.set(h.hold_no, await findOrQueueHold(this.db, batch, vessel_id, h.hold_no, h.volume_m3));
    }

    const cargoIdByName = new Map<string, string>();
    for (const h of parsed.holds) {
      if (!h.cargo_name || cargoIdByName.has(h.cargo_name)) continue;
      cargoIdByName.set(h.cargo_name, await findOrQueue(this.db, batch, 'cargoes', h.cargo_name));
    }

    const loading_port_id = parsed.loading_port
      ? await findOrQueue(this.db, batch, 'ports', parsed.loading_port)
      : null;
    const discharging_port_id = parsed.discharging_port
      ? await findOrQueue(this.db, batch, 'ports', parsed.discharging_port)
      : null;

    const voyage_id = crypto.randomUUID();
    const voyage_no = parsed.voyage_no ?? `IMPORT-${Date.now()}`;
    const now = new Date().toISOString();
    batch.push({
      sql: `INSERT INTO voyages (
         id, vessel_id, voyage_no,
         loading_port_id, discharging_port_id, status,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`,
      params: [voyage_id, vessel_id, voyage_no, loading_port_id, discharging_port_id, now, now],
    });
    await this.db.executeBatch(batch);
    const skeleton = { voyage_id, holdIdByNo, cargoIdByName };

    // Phase 2: load + discharge through their proper services. Each
    // service runs its own transaction; failures here leave the
    // skeleton in place but the voyage is open and recoverable.
    for (const h of accepted) {
      if (h.loaded_tons > 0 && h.cargo_name && h.sf > 0) {
        const hold_id = skeleton.holdIdByNo.get(h.hold_no);
        const cargo_id = skeleton.cargoIdByName.get(h.cargo_name);
        if (!hold_id || !cargo_id) continue;
        await lots.add({
          voyage_id: skeleton.voyage_id,
          source_vessel: 'IMPORT',
          cargo_id,
          hold_id,
          protein_percent: h.protein_percent,
          sf: h.sf,
          planned_tons: h.loaded_tons,
          loaded_tons: h.loaded_tons,
        });
      }
    }

    for (const h of accepted) {
      if (h.discharged_tons > 0) {
        const hold_id = skeleton.holdIdByNo.get(h.hold_no);
        if (!hold_id) continue;
        await ogv.discharge({
          voyage_id: skeleton.voyage_id,
          hold_id,
          tons: h.discharged_tons,
          event_date: new Date().toISOString().slice(0, 10),
          description: 'Imported from XLSX',
        });
      }
    }

    return { voyage_id: skeleton.voyage_id, rejected };
  }
}

/**
 * Locates the Load Stowage Plan sheet inside `wb`. Strategy:
 *  1. Sheets whose name does not look like a sibling tab (SOF / OGV /
 *     CRANE CORR.) come first.
 *  2. Among those, prefer one whose row 4 has a numeric hold number in
 *     column P AND a numeric SF in column O.
 *  3. Fall back to the first worksheet so the caller still gets *some*
 *     parse attempt for unfamiliar layouts.
 */
function pickLoadPlanSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const SIBLINGS = /^(sof|ogv|crane.*)$/i;
  const candidates = wb.worksheets.filter((s) => !SIBLINGS.test(s.name.trim()));
  for (const ws of candidates) {
    const p4 = asNumber(cellValue(ws, 'P4'));
    const o4 = asNumber(cellValue(ws, 'O4'));
    if (p4 !== null && o4 !== null && o4 > 0) return ws;
  }
  return candidates[0] ?? wb.worksheets[0]!;
}

// ───────────────────────────────────────────── helpers ─────────────

type NamedTable = 'vessels' | 'cargoes' | 'ports';

/**
 * Id of the row named `name` (case-insensitive) — existing, or a new id whose
 * INSERT is queued into `batch`. A name queued earlier in the same batch is reused.
 */
async function findOrQueue(
  db: Db,
  batch: BatchStatement[],
  table: NamedTable,
  name: string,
): Promise<string> {
  const rows = await db.select<{ id: string }>(
    `SELECT id FROM ${table} WHERE LOWER(name) = LOWER(?) LIMIT 1`,
    [name],
  );
  if (rows[0]) return rows[0].id;
  const pending = batch.find(
    (st) => st.sql.startsWith(`INSERT INTO ${table} `) && String(st.params[1]).toLowerCase() === name.toLowerCase(),
  );
  if (pending) return pending.params[0] as string;
  const id = crypto.randomUUID();
  batch.push({ sql: `INSERT INTO ${table} (id, name) VALUES (?, ?)`, params: [id, name] });
  return id;
}

async function findOrQueueHold(
  db: Db,
  batch: BatchStatement[],
  vessel_id: string,
  hold_no: number,
  volume_m3: number,
): Promise<string> {
  const rows = await db.select<{ id: string }>(
    `SELECT id FROM holds WHERE vessel_id = ? AND hold_no = ? LIMIT 1`,
    [vessel_id, hold_no],
  );
  if (rows[0]) return rows[0].id;
  const pending = batch.find(
    (st) => st.sql.startsWith('INSERT INTO holds ') && st.params[1] === vessel_id && st.params[2] === hold_no,
  );
  if (pending) return pending.params[0] as string;
  const id = crypto.randomUUID();
  batch.push({
    sql: `INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`,
    params: [id, vessel_id, hold_no, volume_m3],
  });
  return id;
}
