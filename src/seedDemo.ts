import { CargoLotService } from './services/CargoLotService';
import { OgvService } from './services/OgvService';
import { KAVKAZ_IV_HOLDS } from './fixtures/kavkaz-iv';
import type { Db } from './services/db';

const VESSEL_NAME = 'KAVKAZ IV';
const VOYAGE_NO = 'DEMO-001';
const CARGOES = ['SFM', 'WHEAT'] as const;

interface SeedResult {
  voyage_id: string;
  vessel_id: string;
  created: boolean;
}

/**
 * Idempotently seeds the local DB with the Appendix C baseline:
 * one vessel "KAVKAZ IV", 5 holds with the real volumes/SFs from the
 * source xlsx, and a voyage with all loaded lots and the two
 * dischargess (1177 t from Hold 3, 824 t from Hold 5) applied.
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
    [VESSEL_NAME, VOYAGE_NO],
  );
  if (existing.length > 0) {
    return { ...existing[0]!, created: false };
  }

  const vesselId = crypto.randomUUID();
  await db.execute(`INSERT INTO vessels (id, name, flag) VALUES (?, ?, ?)`, [
    vesselId,
    VESSEL_NAME,
    'PANAMA',
  ]);

  const cargoIds: Record<string, string> = {};
  for (const name of CARGOES) {
    const id = crypto.randomUUID();
    cargoIds[name] = id;
    await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [id, name]);
  }

  const holdIdsByNo: Record<number, string> = {};
  for (const h of KAVKAZ_IV_HOLDS) {
    const id = crypto.randomUUID();
    holdIdsByNo[h.hold_no] = id;
    await db.execute(
      `INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`,
      [id, vesselId, h.hold_no, h.volume_m3],
    );
  }

  const voyage = { id: crypto.randomUUID() };
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO voyages (id, vessel_id, voyage_no, status, created_at, updated_at)
     VALUES (?, ?, ?, 'open', ?, ?)`,
    [voyage.id, vesselId, VOYAGE_NO, now, now],
  );

  for (const h of KAVKAZ_IV_HOLDS) {
    const holdId = holdIdsByNo[h.hold_no]!;
    await db.execute(
      `INSERT INTO hold_cargo_parameters
         (id, voyage_id, vessel_id, hold_id, cargo_id, sf, fill_percent)
       VALUES (?, ?, ?, ?, ?, ?, 0.98)`,
      [
        crypto.randomUUID(),
        voyage.id,
        vesselId,
        holdId,
        cargoIds[h.cargo]!,
        h.sf,
      ],
    );
  }

  const lots = new CargoLotService(db);
  const ogv = new OgvService(db);

  for (const h of KAVKAZ_IV_HOLDS) {
    const holdId = holdIdsByNo[h.hold_no]!;
    await lots.add({
      voyage_id: voyage.id,
      source_vessel: 'BASELINE-AGG',
      cargo_id: cargoIds[h.cargo]!,
      hold_id: holdId,
      sf: h.sf,
      planned_tons: h.loaded_tons,
      loaded_tons: h.loaded_tons,
    });

    if (h.discharged_tons > 0) {
      await ogv.discharge({
        voyage_id: voyage.id,
        hold_id: holdId,
        tons: h.discharged_tons,
        event_date: new Date().toISOString().slice(0, 10),
        description: 'Demo discharge from Appendix C baseline',
      });
    }
  }

  return { voyage_id: voyage.id, vessel_id: vesselId, created: true };
}
