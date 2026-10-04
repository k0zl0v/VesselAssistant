import { CargoLotService } from './services/CargoLotService';
import { correctedWeight } from './calc/capacity';
import { OgvService } from './services/OgvService';
import { SofService } from './services/SofService';
import { KAVKAZ_IV_HOLDS } from './fixtures/kavkaz-iv';
import {
  DEMO_CRANES,
  DEMO_CRANE_MEASUREMENTS,
  DEMO_CRANE_SHIFT,
  DEMO_CRANE_WORKING,
  DEMO_DISCHARGES,
  DEMO_DISCHARGE_OGV_HOLD,
  DEMO_OGV,
  DEMO_OGV_BARGE,
  DEMO_OGV_BARGE_RECEIPTS,
  DEMO_SHIFT_DATE,
  DEMO_LOADING_PORT,
  DEMO_LOTS,
  DEMO_SOF,
  DEMO_VESSEL,
  DEMO_VOYAGE_NO,
} from './fixtures/kavkaz-iv-demo';
import type { Db } from './services/db';

const CARGOES = ['SFM', 'WHEAT'] as const;

interface SeedResult {
  voyage_id: string;
  vessel_id: string;
  created: boolean;
}

async function findOrInsert(db: Db, table: 'vessels' | 'cargoes' | 'ports' | 'cranes', name: string, extra: Record<string, string | null> = {}): Promise<string> {
  const [row] = await db.select<{ id: string }>(`SELECT id FROM ${table} WHERE name = ? LIMIT 1`, [name]);
  if (row) return row.id;
  const id = crypto.randomUUID();
  const cols = ['id', 'name', ...Object.keys(extra)];
  await db.execute(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
    [id, name, ...Object.values(extra)],
  );
  return id;
}

/**
 * Idempotently seeds the demo voyage from `fixtures/kavkaz-iv-demo.ts` (the real working
 * file): 5 holds with Appendix C volumes and SF, 17 lots from three source vessels,
 * two LIFO discharges on 01.05 into the ocean-going vessel AAI PRELUDE (with its barge
 * receipts), the SOF of 19.04–01.05, and the crane measurements, working coefficients and shift.
 * Reference rows that already exist (same name) are reused.
 *
 * If the demo voyage already exists, returns its id without re-seeding.
 */
export async function seedKavkazDemo(db: Db): Promise<SeedResult> {
  const existing = await db.select<{ voyage_id: string; vessel_id: string }>(
    `SELECT v.id AS voyage_id, ve.id AS vessel_id
       FROM voyages v
       JOIN vessels ve ON ve.id = v.vessel_id
      WHERE ve.name = ? AND v.voyage_no = ?
      LIMIT 1`,
    [DEMO_VESSEL.name, DEMO_VOYAGE_NO],
  );
  if (existing.length > 0) {
    return { ...existing[0]!, created: false };
  }

  const vesselId = await findOrInsert(db, 'vessels', DEMO_VESSEL.name, {
    flag: DEMO_VESSEL.flag,
    owner: DEMO_VESSEL.owner,
  });
  const cargoIds: Record<string, string> = {};
  for (const name of CARGOES) cargoIds[name] = await findOrInsert(db, 'cargoes', name);
  const loadingPortId = await findOrInsert(db, 'ports', DEMO_LOADING_PORT);

  const holdIdsByNo: Record<number, string> = {};
  for (const h of KAVKAZ_IV_HOLDS) {
    const [row] = await db.select<{ id: string }>(
      `SELECT id FROM holds WHERE vessel_id = ? AND hold_no = ? LIMIT 1`,
      [vesselId, h.hold_no],
    );
    const id = row?.id ?? crypto.randomUUID();
    if (!row) {
      await db.execute(`INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`, [
        id,
        vesselId,
        h.hold_no,
        h.volume_m3,
      ]);
    }
    holdIdsByNo[h.hold_no] = id;
  }

  const voyageId = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO voyages (id, vessel_id, voyage_no, loading_port_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'open', ?, ?)`,
    [voyageId, vesselId, DEMO_VOYAGE_NO, loadingPortId, now, now],
  );

  // The first lot of each hold fixes its SF (CargoLotService), so every lot carries the hold's SF.
  const lots = new CargoLotService(db);
  for (const lot of DEMO_LOTS) {
    const hold = KAVKAZ_IV_HOLDS.find((h) => h.hold_no === lot.hold_no)!;
    await lots.add({
      voyage_id: voyageId,
      hold_id: holdIdsByNo[lot.hold_no]!,
      cargo_id: cargoIds[hold.cargo]!,
      source_vessel: lot.source_vessel,
      sf: hold.sf,
      planned_tons: lot.loaded_tons,
      loaded_tons: lot.loaded_tons,
      loaded_at: lot.loaded_at,
    });
  }

  const ogvId = crypto.randomUUID();
  await db.execute(`INSERT INTO ogv_vessels (id, voyage_id, name, status) VALUES (?, ?, ?, 'loading')`, [
    ogvId,
    voyageId,
    DEMO_OGV.name,
  ]);
  const ogvHoldIds: Record<number, string> = {};
  for (const h of DEMO_OGV.holds) {
    ogvHoldIds[h.hold_no] = crypto.randomUUID();
    await db.execute(`INSERT INTO ogv_holds (id, ogv_id, hold_no, planned_tons) VALUES (?, ?, ?, ?)`, [
      ogvHoldIds[h.hold_no]!,
      ogvId,
      h.hold_no,
      h.planned_tons,
    ]);
  }
  for (const r of DEMO_OGV_BARGE_RECEIPTS) {
    await db.execute(
      `INSERT INTO ogv_receipts (id, ogv_id, ogv_hold_id, source_kind, source_name, tons)
       VALUES (?, ?, ?, 'barge', ?, ?)`,
      [crypto.randomUUID(), ogvId, ogvHoldIds[r.hold_no]!, DEMO_OGV_BARGE, r.tons],
    );
  }

  const ogv = new OgvService(db);
  const operationIds: string[] = [];
  for (const [i, d] of DEMO_DISCHARGES.entries()) {
    const { operation_id } = await ogv.discharge({
      voyage_id: voyageId,
      hold_id: holdIdsByNo[d.hold_no]!,
      tons: d.tons,
      event_date: d.event_date,
      time_from: d.time_from,
      description: d.description,
    });
    operationIds.push(operation_id);
    await db.execute(
      `INSERT INTO ogv_receipts (id, ogv_id, ogv_hold_id, source_kind, source_name, tons, started_at, operation_id)
       VALUES (?, ?, ?, 'main_hold', ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        ogvId,
        ogvHoldIds[DEMO_DISCHARGE_OGV_HOLD[i]!]!,
        `Hold №${d.hold_no}`,
        d.tons,
        `${d.event_date}T${d.time_from}:00`,
        operation_id,
      ],
    );
  }

  const sof = new SofService(db);
  for (const e of DEMO_SOF) {
    await sof.create({
      voyage_id: voyageId,
      event_date: e.date,
      time_from: e.from,
      time_to: e.to,
      category: e.category,
      description: e.description,
    });
  }

  const craneIds: Record<string, string> = {};
  for (const name of DEMO_CRANES) craneIds[name] = await findOrInsert(db, 'cranes', name);
  const [hasHistory] = await db.select<{ n: number }>(
    `SELECT COUNT(*) AS n FROM crane_working_coefficients WHERE crane_id IN (?, ?)`,
    [craneIds[DEMO_CRANES[0]]!, craneIds[DEMO_CRANES[1]]!],
  );
  if (!hasHistory || hasHistory.n === 0) {
    for (const m of DEMO_CRANE_MEASUREMENTS) {
      await db.execute(
        `INSERT INTO crane_measurements (id, crane_id, mode, vessel_name, measured_on, coefficient, excluded)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), craneIds[m.crane]!, m.mode, m.vessel_name, m.measured_on, m.coefficient, m.excluded ? 1 : 0],
      );
    }
    for (const w of DEMO_CRANE_WORKING) {
      await db.execute(
        `INSERT INTO crane_working_coefficients (id, crane_id, mode, coefficient, valid_from) VALUES (?, ?, ?, ?, ?)`,
        [crypto.randomUUID(), craneIds[w.crane]!, w.mode, w.coefficient, w.valid_from],
      );
    }
  }
  for (const r of DEMO_CRANE_SHIFT) {
    const k = DEMO_CRANE_WORKING.find((w) => w.crane === r.crane && w.mode === r.mode)!.coefficient;
    await db.execute(
      `INSERT INTO crane_shift_records
         (id, voyage_id, shift_date, crane_id, mode, scale_tons, coefficient, corrected_tons, operation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        voyageId,
        DEMO_SHIFT_DATE,
        craneIds[r.crane]!,
        r.mode,
        r.scale_tons,
        k,
        correctedWeight(r.scale_tons, k),
        r.discharge === undefined ? null : operationIds[r.discharge]!,
      ],
    );
  }
  if (operationIds.length > 0) {
    await db.execute(
      `UPDATE operations SET crane_id = ? WHERE id = ?`,
      [craneIds['CRANE # 1']!, operationIds[0]!],
    );
    await db.execute(`UPDATE operations SET crane_id = ? WHERE id = ?`, [craneIds['CRANE # 2']!, operationIds[1]!]);
  }

  return { voyage_id: voyageId, vessel_id: vesselId, created: true };
}
