import { CraneShiftService, type CraneMode } from './CraneShiftService';
import type { Db } from './db';
import { isAppError } from './errors';

export interface ProfileCraneOperation {
  mode: CraneMode;
  shift_date: string;
  /** Scale weight — what was written off the hold. */
  scale_tons: number;
  hold_no: number | null;
}

export interface ProfileCrane {
  crane_id: string;
  name: string;
  /** Mode of the last operation; `from_own` (discharge) while there is none. */
  mode: CraneMode;
  /** Working coefficient for `mode`, null when none is in force. */
  coefficient: number | null;
  last: ProfileCraneOperation | null;
}

export interface ShipProfileCranes {
  cranes: ProfileCrane[];
  /** Crane of the voyage's most recent shift record. */
  active_crane_id: string | null;
  /** Latest shift of the voyage: Σ (corrected − scale). */
  shift: { date: string; correction_tons: number } | null;
}

interface LastRow {
  crane_id: string;
  mode: CraneMode;
  shift_date: string;
  scale_tons: number;
  hold_no: number | null;
}

/** Read-only view of the cranes for the ship profile strip on Load Plan. */
export async function loadShipProfileCranes(
  db: Db,
  voyage_id: string,
  cranes: readonly { id: string; name: string }[],
  today: string,
): Promise<ShipProfileCranes> {
  const lastRows = await db.select<LastRow>(
    `SELECT r.crane_id, r.mode, r.shift_date, r.scale_tons,
            COALESCE(
              (SELECT MIN(h.hold_no) FROM discharge_allocations da
                 JOIN holds h ON h.id = da.hold_id
                WHERE da.operation_id = r.operation_id),
              (SELECT h.hold_no FROM operations op
                 JOIN holds h ON h.id = COALESCE(op.source_hold, op.target_hold)
                WHERE op.id = r.operation_id)
            ) AS hold_no
       FROM crane_shift_records r
      WHERE r.voyage_id = ?
      ORDER BY r.shift_date DESC, r.created_at DESC, r.rowid DESC`,
    [voyage_id],
  );
  const lastByCrane = new Map<string, LastRow>();
  for (const row of lastRows) if (!lastByCrane.has(row.crane_id)) lastByCrane.set(row.crane_id, row);

  const [shiftRow] = await db.select<{ shift_date: string; correction_tons: number }>(
    `SELECT shift_date, SUM(corrected_tons - scale_tons) AS correction_tons
       FROM crane_shift_records
      WHERE voyage_id = ? AND shift_date = (SELECT MAX(shift_date) FROM crane_shift_records WHERE voyage_id = ?)
      GROUP BY shift_date`,
    [voyage_id, voyage_id],
  );

  const shifts = new CraneShiftService(db);
  const result: ProfileCrane[] = [];
  for (const crane of cranes) {
    const last = lastByCrane.get(crane.id) ?? null;
    const mode: CraneMode = last?.mode ?? 'from_own';
    let coefficient: number | null = null;
    try {
      coefficient = (await shifts.workingCoefficient(crane.id, mode, last?.shift_date ?? today)).coefficient;
    } catch (e) {
      if (!isAppError(e) || e.code !== 'crane.no_coefficient') throw e;
    }
    result.push({
      crane_id: crane.id,
      name: crane.name,
      mode,
      coefficient,
      last: last
        ? { mode: last.mode, shift_date: last.shift_date, scale_tons: last.scale_tons, hold_no: last.hold_no }
        : null,
    });
  }

  return {
    cranes: result,
    active_crane_id: lastRows[0]?.crane_id ?? null,
    shift: shiftRow ? { date: shiftRow.shift_date, correction_tons: shiftRow.correction_tons } : null,
  };
}
