import { CargoLotService } from './services/CargoLotService';
import { CraneCorrectionService } from './services/CraneCorrectionService';
import { OgvService } from './services/OgvService';
import { SofService } from './services/SofService';
import { KAVKAZ_IV_HOLDS } from './fixtures/kavkaz-iv';
import {
  DEMO_CRANES,
  DEMO_CRANE_COEFFICIENTS,
  DEMO_DISCHARGES,
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
 * two LIFO discharges on 01.05, the SOF of 19.04–01.05 and the crane coefficients.
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

  const ogv = new OgvService(db);
  for (const d of DEMO_DISCHARGES) {
    await ogv.discharge({
      voyage_id: voyageId,
      hold_id: holdIdsByNo[d.hold_no]!,
      tons: d.tons,
      event_date: d.event_date,
      time_from: d.time_from,
      description: d.description,
    });
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
  const [hasCoefficients] = await db.select<{ n: number }>(
    `SELECT COUNT(*) AS n FROM crane_coefficients WHERE crane_id IN (?, ?)`,
    [craneIds[DEMO_CRANES[0]]!, craneIds[DEMO_CRANES[1]]!],
  );
  if (!hasCoefficients || hasCoefficients.n === 0) {
    const cranes = new CraneCorrectionService(db);
    for (const c of DEMO_CRANE_COEFFICIENTS) {
      await cranes.create({
        crane_id: craneIds[c.crane]!,
        operation_type: c.operation_type,
        side: c.side,
        vessel_name: c.vessel_name,
        valid_from: c.valid_from,
        valid_to: c.valid_to,
        coefficient: c.coefficient,
      });
    }
  }

  return { voyage_id: voyageId, vessel_id: vesselId, created: true };
}
