import { correctedWeight } from '../calc/capacity';
import type { BatchStatement, Db } from './db';
import { AppError } from './errors';
import { withVoyageGuard, type MutationOptions } from './voyageGuard';

/**
 * Crane operation modes as the operators keep them (docs/ui/excel-reference.md §2).
 * Only «into own holds» is split by side.
 */
export const CRANE_MODES = ['from_own', 'direct', 'into_own_port', 'into_own_starboard'] as const;
export type CraneMode = (typeof CRANE_MODES)[number];

export interface CraneWorkingCoefficient {
  id: string;
  crane_id: string;
  mode: CraneMode;
  coefficient: number;
  valid_from: string;
  note: string | null;
}

export interface CraneCorrection {
  coefficient: number;
  /** Full precision; round only at display (formatTons). */
  corrected_tons: number;
  working: CraneWorkingCoefficient;
}

export interface CraneMeasurement {
  id: string;
  crane_id: string;
  mode: CraneMode;
  vessel_name: string | null;
  measured_on: string;
  coefficient: number;
  excluded: boolean;
  note: string | null;
}

export interface NewMeasurement {
  crane_id: string;
  mode: CraneMode;
  vessel_name?: string | null;
  measured_on: string;
  coefficient: number;
  note?: string | null;
}

export interface NewWorkingCoefficient {
  crane_id: string;
  mode: CraneMode;
  coefficient: number;
  valid_from: string;
  note?: string | null;
}

export interface CraneShiftRecord {
  id: string;
  voyage_id: string;
  shift_date: string;
  crane_id: string;
  mode: CraneMode;
  scale_tons: number;
  coefficient: number;
  corrected_tons: number;
  operation_id: string | null;
  note: string | null;
}

export interface ShiftEntry {
  crane_id: string;
  mode: CraneMode;
  scale_tons: number;
  operation_id?: string | null;
  note?: string | null;
}

export interface ShiftTotals {
  scale_tons: number;
  corrected_tons: number;
  /** corrected − scale; negative when the scales over-read. */
  delta_tons: number;
  count: number;
}

export interface ShiftSummary extends ShiftTotals {
  byMode: Record<CraneMode, ShiftTotals>;
  /** Keyed by `${mode}|${crane_id}`. */
  byModeCrane: Record<string, ShiftTotals>;
}

/** A voyage discharge an «ИЗ СЕБЯ» shift line can point at. */
export interface DischargeOperationRef {
  id: string;
  event_date: string;
  time_from: string | null;
  tons: number;
  hold_no: number | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(label: string, value: string): void {
  if (!ISO_DATE_RE.test(value)) throw new Error(`${label} must be YYYY-MM-DD, got "${value}"`);
}

function assertCoefficient(value: number): void {
  if (!Number.isFinite(value) || !(value > 0)) throw new Error(`coefficient must be > 0, got ${value}`);
}

const emptyTotals = (): ShiftTotals => ({ scale_tons: 0, corrected_tons: 0, delta_tons: 0, count: 0 });

function add(into: ShiftTotals, r: Pick<CraneShiftRecord, 'scale_tons' | 'corrected_tons'>): void {
  into.scale_tons += r.scale_tons;
  into.corrected_tons += r.corrected_tons;
  into.delta_tons = into.corrected_tons - into.scale_tons;
  into.count += 1;
}

export const modeCraneKey = (mode: CraneMode, crane_id: string): string => `${mode}|${crane_id}`;

/** Scale / corrected / delta over any set of shift lines, overall, per mode and per (mode, crane). */
export function summarizeShift(records: readonly Pick<CraneShiftRecord, 'mode' | 'crane_id' | 'scale_tons' | 'corrected_tons'>[]): ShiftSummary {
  const total = emptyTotals();
  const byMode = Object.fromEntries(CRANE_MODES.map((m) => [m, emptyTotals()])) as Record<CraneMode, ShiftTotals>;
  const byModeCrane: Record<string, ShiftTotals> = {};
  for (const r of records) {
    add(total, r);
    add(byMode[r.mode], r);
    const key = modeCraneKey(r.mode, r.crane_id);
    add((byModeCrane[key] ??= emptyTotals()), r);
  }
  return { ...total, byMode, byModeCrane };
}

/** Mean coefficient over measurements not marked as outliers; null when none are left. */
export function averageOfIncluded(measurements: readonly Pick<CraneMeasurement, 'coefficient' | 'excluded'>[]): number | null {
  const kept = measurements.filter((m) => !m.excluded);
  if (kept.length === 0) return null;
  return kept.reduce((s, m) => s + m.coefficient, 0) / kept.length;
}

/** The working value in force on `date` from an already loaded list (latest `valid_from` ≤ date). */
export function workingOn(
  working: readonly CraneWorkingCoefficient[],
  crane_id: string,
  mode: CraneMode,
  date: string,
): CraneWorkingCoefficient | null {
  let best: CraneWorkingCoefficient | null = null;
  for (const w of working) {
    if (w.crane_id !== crane_id || w.mode !== mode || w.valid_from > date) continue;
    if (!best || w.valid_from > best.valid_from) best = w;
  }
  return best;
}

interface MeasurementRow extends Omit<CraneMeasurement, 'excluded'> {
  excluded: number;
}

const toMeasurement = (r: MeasurementRow): CraneMeasurement => ({ ...r, excluded: r.excluded === 1 });

/**
 * Crane correction as the operators keep it: a measurement history per (crane, mode) with
 * manual outlier exclusion, a separately accepted working coefficient, and the shift sheet
 * of scale vs corrected weights. The scale weight is what goes into hold remains; the
 * corrected weight lives only on the crane sheet (ui-kit § «Краны видны на рабочих экранах»).
 */
export class CraneShiftService {
  constructor(private readonly db: Db) {}

  // ── Working coefficient ───────────────────────────────────────────

  /** The working coefficient in force on `date` (latest `valid_from` ≤ date). */
  async workingCoefficient(crane_id: string, mode: CraneMode, date: string): Promise<CraneWorkingCoefficient> {
    const [row] = await this.db.select<CraneWorkingCoefficient>(
      `SELECT * FROM crane_working_coefficients
        WHERE crane_id = ? AND mode = ? AND valid_from <= ?
        ORDER BY valid_from DESC
        LIMIT 1`,
      [crane_id, mode, date],
    );
    if (!row) throw new AppError('crane.no_coefficient', { mode, date });
    return row;
  }

  async correct(scale_tons: number, crane_id: string, mode: CraneMode, date: string): Promise<CraneCorrection> {
    const working = await this.workingCoefficient(crane_id, mode, date);
    return { coefficient: working.coefficient, corrected_tons: correctedWeight(scale_tons, working.coefficient), working };
  }

  /** Working-value history, newest first. */
  async listWorkingCoefficients(filter: { crane_id?: string; mode?: CraneMode } = {}): Promise<CraneWorkingCoefficient[]> {
    const { where, params } = craneModeWhere(filter);
    return await this.db.select<CraneWorkingCoefficient>(
      `SELECT * FROM crane_working_coefficients${where} ORDER BY crane_id, mode, valid_from DESC`,
      params,
    );
  }

  /**
   * Accepts a working value from `valid_from` on. Earlier values stay as history; a second
   * value on the same day replaces that day's row (the schema keeps one per day).
   */
  async setWorkingCoefficient(input: NewWorkingCoefficient): Promise<CraneWorkingCoefficient> {
    assertDate('valid_from', input.valid_from);
    assertCoefficient(input.coefficient);
    await this.db.execute(
      `INSERT INTO crane_working_coefficients (id, crane_id, mode, coefficient, valid_from, note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (crane_id, mode, valid_from)
       DO UPDATE SET coefficient = excluded.coefficient, note = excluded.note`,
      [crypto.randomUUID(), input.crane_id, input.mode, input.coefficient, input.valid_from, input.note ?? null],
    );
    const [row] = await this.db.select<CraneWorkingCoefficient>(
      `SELECT * FROM crane_working_coefficients WHERE crane_id = ? AND mode = ? AND valid_from = ?`,
      [input.crane_id, input.mode, input.valid_from],
    );
    return row!;
  }

  // ── Measurements ──────────────────────────────────────────────────

  /** Measurement history, oldest first within each (crane, mode). */
  async listMeasurements(filter: { crane_id?: string; mode?: CraneMode } = {}): Promise<CraneMeasurement[]> {
    const { where, params } = craneModeWhere(filter);
    const rows = await this.db.select<MeasurementRow>(
      `SELECT id, crane_id, mode, vessel_name, measured_on, coefficient, excluded, note
         FROM crane_measurements${where}
        ORDER BY crane_id, mode, measured_on, created_at`,
      params,
    );
    return rows.map(toMeasurement);
  }

  async addMeasurement(input: NewMeasurement): Promise<CraneMeasurement> {
    assertDate('measured_on', input.measured_on);
    assertCoefficient(input.coefficient);
    const id = crypto.randomUUID();
    await this.db.execute(
      `INSERT INTO crane_measurements (id, crane_id, mode, vessel_name, measured_on, coefficient, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, input.crane_id, input.mode, input.vessel_name?.trim() || null, input.measured_on, input.coefficient, input.note ?? null],
    );
    const [row] = await this.db.select<MeasurementRow>(
      `SELECT id, crane_id, mode, vessel_name, measured_on, coefficient, excluded, note FROM crane_measurements WHERE id = ?`,
      [id],
    );
    return toMeasurement(row!);
  }

  /** Marks a measurement as an outlier (or brings it back); it stays in the history either way. */
  async setMeasurementExcluded(id: string, excluded: boolean): Promise<void> {
    await this.db.execute(`UPDATE crane_measurements SET excluded = ? WHERE id = ?`, [excluded ? 1 : 0, id]);
  }

  async averageIncluded(crane_id: string, mode: CraneMode): Promise<number | null> {
    return averageOfIncluded(await this.listMeasurements({ crane_id, mode }));
  }

  // ── Shift sheet ───────────────────────────────────────────────────

  /** Shift lines of a voyage, optionally of one shift date, in date / mode / crane order. */
  async listShiftRecords(voyage_id: string, shift_date?: string): Promise<CraneShiftRecord[]> {
    const params: string[] = [voyage_id];
    let sql = `SELECT r.id, r.voyage_id, r.shift_date, r.crane_id, r.mode, r.scale_tons, r.coefficient,
                      r.corrected_tons, r.operation_id, r.note
                 FROM crane_shift_records r
                 JOIN cranes c ON c.id = r.crane_id
                WHERE r.voyage_id = ?`;
    if (shift_date) {
      sql += ` AND r.shift_date = ?`;
      params.push(shift_date);
    }
    sql += ` ORDER BY r.shift_date,
                      CASE r.mode WHEN 'from_own' THEN 0 WHEN 'direct' THEN 1 WHEN 'into_own_port' THEN 2 ELSE 3 END,
                      c.name, r.created_at`;
    return await this.db.select<CraneShiftRecord>(sql, params);
  }

  /** Dates that have shift lines, newest first. */
  async shiftDates(voyage_id: string): Promise<string[]> {
    const rows = await this.db.select<{ shift_date: string }>(
      `SELECT DISTINCT shift_date FROM crane_shift_records WHERE voyage_id = ? ORDER BY shift_date DESC`,
      [voyage_id],
    );
    return rows.map((r) => r.shift_date);
  }

  /**
   * Records one shift: each scale weight is divided by the working coefficient in force on
   * `shift_date`; the coefficient and corrected weight are frozen on the line, so a later
   * change of the working value does not rewrite past shifts. All lines or none.
   */
  async recordShift(
    input: { voyage_id: string; shift_date: string; entries: readonly ShiftEntry[] },
    opts?: MutationOptions,
  ): Promise<CraneShiftRecord[]> {
    assertDate('shift_date', input.shift_date);
    if (input.entries.length === 0) throw new Error('a shift needs at least one scale weight');
    for (const e of input.entries) {
      if (!Number.isFinite(e.scale_tons) || !(e.scale_tons > 0)) {
        throw new Error(`scale_tons must be > 0, got ${e.scale_tons}`);
      }
    }
    return withVoyageGuard(this.db, input.voyage_id, opts, async () => {
      const ids: string[] = [];
      const batch: BatchStatement[] = [];
      for (const e of input.entries) {
        const { coefficient, corrected_tons } = await this.correct(e.scale_tons, e.crane_id, e.mode, input.shift_date);
        const id = crypto.randomUUID();
        ids.push(id);
        batch.push({
          sql: `INSERT INTO crane_shift_records
                  (id, voyage_id, shift_date, crane_id, mode, scale_tons, coefficient, corrected_tons, operation_id, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            id, input.voyage_id, input.shift_date, e.crane_id, e.mode,
            e.scale_tons, coefficient, corrected_tons, e.operation_id ?? null, e.note?.trim() || null,
          ],
        });
      }
      await this.db.executeBatch(batch);
      const rows = await this.listShiftRecords(input.voyage_id, input.shift_date);
      return rows.filter((r) => ids.includes(r.id));
    });
  }

  async deleteShiftRecord(id: string, opts?: MutationOptions): Promise<void> {
    const [row] = await this.db.select<{ voyage_id: string }>(`SELECT voyage_id FROM crane_shift_records WHERE id = ?`, [id]);
    if (!row) return;
    await withVoyageGuard(this.db, row.voyage_id, opts, async () => {
      await this.db.execute(`DELETE FROM crane_shift_records WHERE id = ?`, [id]);
    });
  }

  /** Totals of one shift date, or of the whole voyage when `shift_date` is omitted. */
  async totals(voyage_id: string, shift_date?: string): Promise<ShiftSummary> {
    return summarizeShift(await this.listShiftRecords(voyage_id, shift_date));
  }

  /** Voyage discharges (optionally of one date) — what an «ИЗ СЕБЯ» line links to. */
  async listDischargeOperations(voyage_id: string, event_date?: string): Promise<DischargeOperationRef[]> {
    const params: string[] = [voyage_id];
    let sql = `SELECT o.id, o.event_date, o.time_from, COALESCE(o.tons, 0) AS tons, h.hold_no
                 FROM operations o
                 LEFT JOIN holds h ON h.id = o.source_hold
                WHERE o.voyage_id = ? AND o.type = 'discharge'`;
    if (event_date) {
      sql += ` AND o.event_date = ?`;
      params.push(event_date);
    }
    sql += ` ORDER BY o.event_date, o.time_from, h.hold_no`;
    return await this.db.select<DischargeOperationRef>(sql, params);
  }

  /** Discharged by ship scales (the Load Plan figure), for the whole voyage or one date. */
  async dischargedTons(voyage_id: string, event_date?: string): Promise<number> {
    const params: string[] = [voyage_id];
    let sql = `SELECT COALESCE(SUM(da.discharged_tons), 0) AS tons
                 FROM discharge_allocations da
                 JOIN operations o ON o.id = da.operation_id
                WHERE o.voyage_id = ?`;
    if (event_date) {
      sql += ` AND o.event_date = ?`;
      params.push(event_date);
    }
    const [row] = await this.db.select<{ tons: number }>(sql, params);
    return row?.tons ?? 0;
  }
}

function craneModeWhere(filter: { crane_id?: string; mode?: CraneMode }): { where: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  if (filter.crane_id) {
    parts.push('crane_id = ?');
    params.push(filter.crane_id);
  }
  if (filter.mode) {
    parts.push('mode = ?');
    params.push(filter.mode);
  }
  return { where: parts.length ? ` WHERE ${parts.join(' AND ')}` : '', params };
}
