import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roundTo3 } from '../../calc/round';
import { CargoLotService } from '../CargoLotService';
import { AppError } from '../errors';
import { listDischargeHistory } from '../DischargeHistory';
import { OgvService } from '../OgvService';
import { OgvVesselService } from '../OgvVesselService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';

/** docs/ui/excel-reference.md §1 — cargo plan of AAI PRELUDE, stern (7) to bow (1). */
const PLAN: Record<number, number> = { 7: 11079, 6: 10869, 5: 8324, 4: 7900, 3: 10456, 2: 10869, 1: 9503 };
/** Barge KAVKAZ III → OGV holds, 56 753.045 t in all. */
const BARGE: Record<number, number> = { 7: 11017.974, 6: 10869, 5: 6938.661, 4: 7904.14, 3: 10456, 1: 9567.27 };

interface Fixture {
  voyageId: string;
  mainHold: Record<number, string>;
  craneIds: [string, string];
  ogvHold: Record<number, string>;
}

/** Main vessel holds 3 and 5 with the real lots (excel-reference §4), two cranes with working coefficients. */
async function seed(db: NodeDb): Promise<Fixture> {
  const ref = await seedReferenceData(db, { vesselName: 'MAIN VESSEL', holdNos: [3, 5], cargoName: 'SFM' });
  const voyage = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: ref.vesselId, voyage_no: 'DEMO-001' });
  const lots = new CargoLotService(db);
  const layers: [number, string, number][] = [
    [3, 'ALISA V', 2290], [3, 'VLADIMIR', 1712],
    [5, 'ALISA V', 1735.54], [5, 'VLADIMIR', 2427.415],
  ];
  const mainHold = { 3: ref.holdIds[0]!, 5: ref.holdIds[1]! };
  for (const [no, vessel, tons] of layers) {
    await lots.add({
      voyage_id: voyage.id, hold_id: mainHold[no as 3 | 5], cargo_id: ref.cargoId, source_vessel: vessel,
      sf: 1.44, planned_tons: tons, loaded_tons: tons,
    });
  }
  const craneIds: [string, string] = [crypto.randomUUID(), crypto.randomUUID()];
  for (const [i, k] of [[0, 1.06], [1, 0.96]] as const) {
    await db.execute(`INSERT INTO cranes (id, name) VALUES (?, ?)`, [craneIds[i], `Crane ${i + 1}`]);
    await db.execute(
      `INSERT INTO crane_working_coefficients (id, crane_id, mode, coefficient, valid_from) VALUES (?, ?, 'from_own', ?, '2026-01-01')`,
      [crypto.randomUUID(), craneIds[i], k],
    );
  }

  const ogv = new OgvVesselService(db);
  const vessel = await ogv.create({
    voyage_id: voyage.id,
    name: 'AAI PRELUDE',
    holds: Object.entries(PLAN).map(([no, planned]) => ({ hold_no: Number(no), planned_tons: planned })),
  });
  const ogvHold: Record<number, string> = {};
  for (const h of await ogv.holds(vessel.id)) ogvHold[h.hold_no] = h.id;
  return { voyageId: voyage.id, mainHold, craneIds, ogvHold };
}

describe('OGV as the receiving vessel (excel-reference §1)', () => {
  let db: NodeDb;
  let f: Fixture;
  let ogv: OgvVesselService;

  beforeEach(async () => {
    db = await openTestDb();
    f = await seed(db);
    ogv = new OgvVesselService(db);
  });

  afterEach(() => db.close());

  async function loadAsInTheFile(): Promise<void> {
    for (const [no, tons] of Object.entries(BARGE)) {
      await ogv.addBargeReceipt({ voyage_id: f.voyageId, ogv_hold_id: f.ogvHold[Number(no)]!, source_name: 'KAVKAZ III', tons });
    }
    const discharge = new OgvService(db);
    await discharge.discharge({
      voyage_id: f.voyageId, hold_id: f.mainHold[3]!, tons: 1177, event_date: '2026-09-24', time_from: '12:40',
      crane_id: f.craneIds[0], ogv_hold_id: f.ogvHold[2]!,
    });
    await discharge.discharge({
      voyage_id: f.voyageId, hold_id: f.mainHold[5]!, tons: 824, event_date: '2026-09-25',
      crane_id: f.craneIds[1], crane_mode: 'from_own', ogv_hold_id: f.ogvHold[5]!,
    });
  }

  it('barge 56 753.045 + main holds 2 001.000 = loaded 58 754.045; plan 69 000 → remains 10 245.955', async () => {
    await loadAsInTheFile();
    const s = (await ogv.summary(f.voyageId))!;

    expect(roundTo3(s.totals.barge_tons)).toBe(56753.045);
    expect(roundTo3(s.totals.main_hold_tons)).toBe(2001);
    expect(roundTo3(s.totals.loaded_tons)).toBe(58754.045);
    expect(roundTo3(s.totals.planned_tons)).toBe(69000);
    expect(roundTo3(s.totals.remain_tons)).toBe(10245.955);
    expect(s.totals.main_hold_operations).toBe(2);
  });

  it('OGV hold 5 = 6 938.661 + 824 = 7 762.661; holds 4 and 1 are over plan by 4.140 and 64.270', async () => {
    await loadAsInTheFile();
    const s = (await ogv.summary(f.voyageId))!;
    const hold = (no: number) => s.holds.find((h) => h.hold_no === no)!;

    expect(s.holds.map((h) => h.hold_no)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(roundTo3(hold(5).loaded_tons)).toBe(7762.661);
    expect(roundTo3(hold(5).main_hold_tons)).toBe(824);
    expect(roundTo3(hold(2).loaded_tons)).toBe(1177);
    expect(roundTo3(hold(4).remain_tons)).toBe(-4.14);
    expect(roundTo3(hold(1).remain_tons)).toBe(-64.27);
    expect(s.totals.over_plan_hold_nos).toEqual([4, 1]);
    expect(hold(6).over_plan).toBe(false);
    expect(roundTo3(hold(6).remain_tons)).toBe(0);
  });

  it('a discharge with crane and OGV hold writes operation, receipt and crane-sheet row in one go — scale weight in the layers', async () => {
    await loadAsInTheFile();

    const [op] = await db.select<{ crane_id: string; tons: number }>(
      `SELECT crane_id, tons FROM operations WHERE source_hold = ?`,
      [f.mainHold[3]!],
    );
    expect(op).toEqual({ crane_id: f.craneIds[0], tons: 1177 });

    const shift = await db.select<{ mode: string; scale_tons: number; coefficient: number; corrected_tons: number }>(
      `SELECT mode, scale_tons, coefficient, corrected_tons FROM crane_shift_records ORDER BY scale_tons DESC`,
    );
    expect(shift.map((r) => ({ ...r, corrected_tons: roundTo3(r.corrected_tons) }))).toEqual([
      { mode: 'from_own', scale_tons: 1177, coefficient: 1.06, corrected_tons: 1110.377 },
      { mode: 'from_own', scale_tons: 824, coefficient: 0.96, corrected_tons: 858.333 },
    ]);

    // LIFO wrote off the scale weight from the top layer (VLADIMIR), not the corrected one.
    const layers = await db.select<{ source_vessel: string; remaining_tons: number }>(
      `SELECT source_vessel, remaining_tons FROM cargo_layers WHERE hold_id = ? ORDER BY load_sequence`,
      [f.mainHold[3]!],
    );
    expect(layers).toEqual([
      { source_vessel: 'ALISA V', remaining_tons: 2290 },
      { source_vessel: 'VLADIMIR', remaining_tons: 535 },
    ]);

    const s = (await ogv.summary(f.voyageId))!;
    const main = s.receipts.filter((r) => r.source_kind === 'main_hold');
    expect(main.map((r) => [r.source_name, r.source_hold_no, r.ogv_hold_no, r.tons, r.crane_name, r.started_at])).toEqual([
      ['Hold №3', 3, 2, 1177, 'Crane 1', '2026-09-24 12:40'],
      ['Hold №5', 5, 5, 824, 'Crane 2', '2026-09-25'],
    ]);
    expect(main[0]!.cargo_name).toBe('SFM');
  });

  it('the discharge history carries crane, mode, coefficient, corrected weight and OGV hold', async () => {
    await loadAsInTheFile();
    const history = await listDischargeHistory(db, f.voyageId);
    expect(
      history.map((o) => [o.hold_no, o.tons, o.crane_name, o.crane_mode, o.coefficient, roundTo3(o.corrected_tons!), o.ogv_hold_no]),
    ).toEqual([
      [5, 824, 'Crane 2', 'from_own', 0.96, 858.333, 5],
      [3, 1177, 'Crane 1', 'from_own', 1.06, 1110.377, 2],
    ]);
  });

  it('the old call signature still works: no crane, no OGV hold → no receipt, no crane-sheet row', async () => {
    await new OgvService(db).discharge({ voyage_id: f.voyageId, hold_id: f.mainHold[3]!, tons: 100, event_date: '2026-09-24' });
    expect(await db.select(`SELECT id FROM ogv_receipts`)).toEqual([]);
    expect(await db.select(`SELECT id FROM crane_shift_records`)).toEqual([]);
    const [h] = await listDischargeHistory(db, f.voyageId);
    expect([h!.crane_name, h!.coefficient, h!.ogv_hold_no]).toEqual([null, null, null]);
  });

  it('no working coefficient for the mode → crane.no_coefficient, nothing written', async () => {
    const err = await new OgvService(db)
      .discharge({
        voyage_id: f.voyageId, hold_id: f.mainHold[3]!, tons: 100, event_date: '2026-09-24',
        crane_id: f.craneIds[0], crane_mode: 'direct', ogv_hold_id: f.ogvHold[2]!,
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('crane.no_coefficient');
    expect(await db.select(`SELECT id FROM operations`)).toEqual([]);
    expect(await db.select(`SELECT id FROM ogv_receipts`)).toEqual([]);
  });

  it('an OGV hold of another voyage → ogv.hold_not_found, nothing written', async () => {
    const err = await new OgvService(db)
      .discharge({ voyage_id: f.voyageId, hold_id: f.mainHold[3]!, tons: 100, event_date: '2026-09-24', ogv_hold_id: 'nope' })
      .catch((e: unknown) => e);
    expect((err as AppError).code).toBe('ogv.hold_not_found');
    expect(await db.select(`SELECT id FROM operations`)).toEqual([]);
  });

  it('one OGV per voyage', async () => {
    await expect(ogv.create({ voyage_id: f.voyageId, name: 'SECOND', holds: [{ hold_no: 1, planned_tons: 1 }] })).rejects.toThrow();
    expect(await db.select(`SELECT id FROM ogv_vessels`)).toHaveLength(1);
  });

  it('summary is null for a voyage without an OGV', async () => {
    const ref = await seedReferenceData(db, { vesselName: 'OTHER', holdNos: [1] });
    const v = await new VoyageService(db, NOOP_AUTO_BACKUP).create({ vessel_id: ref.vesselId, voyage_no: 'X-1' });
    expect(await ogv.summary(v.id)).toBeNull();
  });

  it('barge receipts: only barge rows can be deleted', async () => {
    const id = await ogv.addBargeReceipt({ voyage_id: f.voyageId, ogv_hold_id: f.ogvHold[7]!, source_name: ' KAVKAZ III ', tons: 500 });
    const [row] = await db.select<{ source_name: string }>(`SELECT source_name FROM ogv_receipts WHERE id = ?`, [id]);
    expect(row!.source_name).toBe('KAVKAZ III');
    await new OgvService(db).discharge({
      voyage_id: f.voyageId, hold_id: f.mainHold[3]!, tons: 10, event_date: '2026-09-24', ogv_hold_id: f.ogvHold[2]!,
    });
    const [main] = await db.select<{ id: string }>(`SELECT id FROM ogv_receipts WHERE source_kind = 'main_hold'`);
    await expect(ogv.deleteBargeReceipt(f.voyageId, main!.id)).rejects.toThrow();
    await ogv.deleteBargeReceipt(f.voyageId, id);
    expect(await db.select(`SELECT source_kind FROM ogv_receipts`)).toEqual([{ source_kind: 'main_hold' }]);
  });

  it('sequence plan: step state follows the receipts — done, the first unfinished current, the rest pending', async () => {
    await loadAsInTheFile();
    for (const [no, tons] of [[7, 11079], [6, 10869], [4, 7900], [5, 8324], [2, 10869]] as const) {
      await ogv.addStep(f.voyageId, { ogv_hold_id: f.ogvHold[no]!, planned_tons: tons });
    }
    const steps = (await ogv.summary(f.voyageId))!.steps;
    expect(steps.map((s) => [s.step_no, s.ogv_hold_no, s.state])).toEqual([
      [1, 7, 'current'], // 11 017.974 of 11 079
      [2, 6, 'done'],
      [3, 4, 'done'], // over plan
      [4, 5, 'pending'],
      [5, 2, 'pending'],
    ]);
    expect(roundTo3(steps[4]!.remain_tons)).toBe(9692);

    const hold7Step = steps[0]!;
    await ogv.updateStep(f.voyageId, hold7Step.id, { ogv_hold_id: f.ogvHold[7]!, planned_tons: 11017.974, label: 'barges' });
    await ogv.deleteStep(f.voyageId, steps[1]!.id);
    const after = (await ogv.summary(f.voyageId))!.steps;
    expect(after.map((s) => [s.step_no, s.state, s.label])).toEqual([
      [1, 'done', 'barges'],
      [3, 'done', null],
      [4, 'current', null],
      [5, 'pending', null],
    ]);
  });

  it('two steps on one hold split its receipts in order; the last one takes the excess', async () => {
    await loadAsInTheFile();
    await ogv.addStep(f.voyageId, { ogv_hold_id: f.ogvHold[5]!, planned_tons: 6938.661, label: 'barges' });
    await ogv.addStep(f.voyageId, { ogv_hold_id: f.ogvHold[5]!, planned_tons: 1385.339, label: 'main vessel' });
    const [a, b] = (await ogv.summary(f.voyageId))!.steps;
    expect([a!.state, roundTo3(a!.filled_tons)]).toEqual(['done', 6938.661]);
    expect([b!.state, roundTo3(b!.filled_tons), roundTo3(b!.remain_tons)]).toEqual(['current', 824, 561.339]);
  });
});
