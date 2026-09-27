import { KAVKAZ_IV_HOLDS } from '../src/fixtures/kavkaz-iv';
import { CargoLotService } from '../src/services/CargoLotService';
import { OgvService } from '../src/services/OgvService';
import { VoyageService } from '../src/services/VoyageService';
import { NOOP_AUTO_BACKUP } from '../src/services/__tests__/helpers';
import type { NodeDb } from '../src/services/db-node';

/** Seeds run before `login()`, so their own audit rows carry no operator. */

export interface SeededVoyage {
  vesselId: string;
  voyageId: string;
  voyageNo: string;
  holdIdByNo: Map<number, string>;
  cargoIdByName: Map<string, string>;
}

async function insertVoyage(
  db: NodeDb,
  opts: { vesselName: string; voyageNo: string; holds: { hold_no: number; volume_m3: number }[] },
): Promise<SeededVoyage> {
  const vesselId = crypto.randomUUID();
  await db.execute(`INSERT INTO vessels (id, name) VALUES (?, ?)`, [vesselId, opts.vesselName]);
  const cargoIdByName = new Map<string, string>();
  for (const name of ['SFM', 'WHEAT']) {
    const id = crypto.randomUUID();
    cargoIdByName.set(name, id);
    await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [id, name]);
  }
  const holdIdByNo = new Map<number, string>();
  for (const h of opts.holds) {
    const id = crypto.randomUUID();
    holdIdByNo.set(h.hold_no, id);
    await db.execute(`INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`, [
      id, vesselId, h.hold_no, h.volume_m3,
    ]);
  }
  const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: vesselId, voyage_no: opts.voyageNo });
  return { vesselId, voyageId: voyage.id, voyageNo: opts.voyageNo, holdIdByNo, cargoIdByName };
}

/** An open voyage of NORD STAR with one empty hold (S-7). */
export async function seedOpenVoyage(db: NodeDb): Promise<SeededVoyage> {
  return insertVoyage(db, { vesselName: 'NORD STAR', voyageNo: 'NS-SOF', holds: [{ hold_no: 1, volume_m3: 100_000 }] });
}

/** S-1 precondition: hold 1 (100 000 m³, as in `ogv.test.ts`) carries DIANA MARIA, WHEAT, protein 12.5, 1600 t, SF 1.25, sequence 1. */
export async function seedS1(db: NodeDb): Promise<SeededVoyage> {
  const seeded = await insertVoyage(db, { vesselName: 'NORD STAR', voyageNo: 'NS-S1', holds: [{ hold_no: 1, volume_m3: 100_000 }] });
  await new CargoLotService(db).add({
    voyage_id: seeded.voyageId,
    hold_id: seeded.holdIdByNo.get(1)!,
    cargo_id: seeded.cargoIdByName.get('WHEAT')!,
    source_vessel: 'DIANA MARIA',
    protein_percent: 12.5,
    sf: 1.25,
    planned_tons: 1600,
    loaded_tons: 1600,
  });
  return seeded;
}

/** End of S-3: NORD STAR, holds 1–5 from Appendix C, one lot per hold, nothing discharged (on board 25684.955). */
export async function seedNordStarLoaded(db: NodeDb): Promise<SeededVoyage> {
  const seeded = await insertVoyage(db, {
    vesselName: 'NORD STAR',
    voyageNo: 'NS-01',
    holds: KAVKAZ_IV_HOLDS.map((h) => ({ hold_no: h.hold_no, volume_m3: h.volume_m3 })),
  });
  for (const h of KAVKAZ_IV_HOLDS) {
    await new CargoLotService(db).add({
      voyage_id: seeded.voyageId,
      hold_id: seeded.holdIdByNo.get(h.hold_no)!,
      cargo_id: seeded.cargoIdByName.get(h.cargo)!,
      source_vessel: `BARGE ${h.hold_no}`,
      protein_percent: h.cargo === 'WHEAT' ? 12.5 : null,
      sf: h.sf,
      planned_tons: h.loaded_tons,
      loaded_tons: h.loaded_tons,
    });
  }
  return seeded;
}

/** End of S-4: `seedNordStarLoaded` plus the Appendix C discharges (on board 23683.955). */
export async function seedNordStarDischarged(db: NodeDb): Promise<SeededVoyage> {
  const seeded = await seedNordStarLoaded(db);
  for (const h of KAVKAZ_IV_HOLDS.filter((x) => x.discharged_tons > 0)) {
    await new OgvService(db).discharge({
      voyage_id: seeded.voyageId,
      hold_id: seeded.holdIdByNo.get(h.hold_no)!,
      tons: h.discharged_tons,
      event_date: '2026-05-03',
    });
  }
  return seeded;
}
