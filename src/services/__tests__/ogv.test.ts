import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KAVKAZ_IV_HOLDS } from '../../fixtures/kavkaz-iv';
import { CargoLotService } from '../CargoLotService';
import { AppError } from '../errors';
import { OgvService } from '../OgvService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';
import type { BatchStatement, Db, SqlValue } from '../db';
import type { NodeDb } from '../db-node';

describe('OgvService — integration (AT-07 / AT-08 / AT-12)', () => {
  let db: NodeDb;
  let voyageId: string;
  let holdId: string;
  let cargoId: string;
  let lots: CargoLotService;
  let ogv: OgvService;

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, {
      vesselName: 'KAVKAZ IV',
      holdNos: [1, 2],
    });
    holdId = seed.holdIds[0]!;
    cargoId = seed.cargoId;

    const voyages = new VoyageService(db, NOOP_AUTO_BACKUP);
    const voyage = await voyages.create({
      vessel_id: seed.vesselId,
      voyage_no: 'VY-1',
    });
    voyageId = voyage.id;

    lots = new CargoLotService(db);
    ogv = new OgvService(db);

    // DIANA MARIA loaded first (bottom layer), then VELES (top layer).
    await lots.add({
      voyage_id: voyageId, source_vessel: 'DIANA MARIA', cargo_id: cargoId,
      hold_id: holdId, sf: 1.25, planned_tons: 1600, loaded_tons: 1600,
    });
    await lots.add({
      voyage_id: voyageId, source_vessel: 'VELES', cargo_id: cargoId,
      hold_id: holdId, sf: 1.30, planned_tons: 1200, loaded_tons: 1200,
    });
  });

  afterEach(() => {
    db.close();
  });

  it('availableBySource sums remaining_tons per source vessel', async () => {
    const avail = await ogv.availableBySource(voyageId);
    expect(avail).toEqual([
      { source_vessel: 'DIANA MARIA', remaining_tons: 1600 },
      { source_vessel: 'VELES', remaining_tons: 1200 },
    ]);
  });

  it('AT-07: discharge 500 t writes off only VELES (top layer)', async () => {
    const result = await ogv.discharge({
      voyage_id: voyageId,
      hold_id: holdId,
      tons: 500,
      event_date: '2026-05-01',
    });

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0]).toMatchObject({
      source_vessel: 'VELES',
      discharged_tons: 500,
    });

    const avail = await ogv.availableBySource(voyageId);
    expect(avail).toEqual([
      { source_vessel: 'DIANA MARIA', remaining_tons: 1600 },
      { source_vessel: 'VELES', remaining_tons: 700 },
    ]);
  });

  it('AT-08: subsequent 900 t discharge spans VELES then DIANA MARIA', async () => {
    await ogv.discharge({
      voyage_id: voyageId, hold_id: holdId, tons: 500,
      event_date: '2026-05-01',
    });
    const result = await ogv.discharge({
      voyage_id: voyageId, hold_id: holdId, tons: 900,
      event_date: '2026-05-02',
    });

    expect(result.allocations).toHaveLength(2);
    const fromVeles = result.allocations.find((a) => a.source_vessel === 'VELES')!;
    const fromDiana = result.allocations.find((a) => a.source_vessel === 'DIANA MARIA')!;
    expect(fromVeles.discharged_tons).toBe(700);
    expect(fromDiana.discharged_tons).toBe(200);

    const avail = await ogv.availableBySource(voyageId);
    expect(avail).toEqual([
      { source_vessel: 'DIANA MARIA', remaining_tons: 1400 },
    ]);
  });

  it('marks layer as depleted when remaining_tons reaches 0', async () => {
    await ogv.discharge({
      voyage_id: voyageId, hold_id: holdId, tons: 1200,
      event_date: '2026-05-01',
    });

    const layers = await db.select<{ source_vessel: string; layer_status: string; remaining_tons: number }>(
      `SELECT source_vessel, layer_status, remaining_tons FROM cargo_layers WHERE voyage_id = ? AND hold_id = ?`,
      [voyageId, holdId],
    );
    const veles = layers.find((l) => l.source_vessel === 'VELES')!;
    expect(veles.layer_status).toBe('depleted');
    expect(veles.remaining_tons).toBe(0);
  });

  it('writes one operations row and matching discharge_allocations rows', async () => {
    await ogv.discharge({
      voyage_id: voyageId, hold_id: holdId, tons: 1500,
      event_date: '2026-05-01',
    });

    const ops = await db.select<{ tons: number; type: string }>(
      `SELECT tons, type FROM operations WHERE voyage_id = ?`,
      [voyageId],
    );
    expect(ops).toEqual([{ tons: 1500, type: 'discharge' }]);

    const allocs = await db.select<{ source_vessel: string; discharged_tons: number }>(
      `SELECT source_vessel, discharged_tons FROM discharge_allocations
        ORDER BY discharged_tons DESC`,
      [],
    );
    expect(allocs).toEqual([
      { source_vessel: 'VELES', discharged_tons: 1200 },
      { source_vessel: 'DIANA MARIA', discharged_tons: 300 },
    ]);
  });

  it('rolls back the entire operation when the hold is short of cargo', async () => {
    await expect(
      ogv.discharge({
        voyage_id: voyageId, hold_id: holdId, tons: 5000,
        event_date: '2026-05-01',
      }),
    ).rejects.toMatchObject({
      code: 'ogv.insufficient_cargo',
      params: { hold_no: 1, short_tons: 2200 },
    });

    // No operation row should exist; layers remain untouched.
    const ops = await db.select<{ count: number }>(
      `SELECT COUNT(*) AS count FROM operations`,
      [],
    );
    expect(ops[0]!.count).toBe(0);

    const avail = await ogv.availableBySource(voyageId);
    expect(avail).toEqual([
      { source_vessel: 'DIANA MARIA', remaining_tons: 1600 },
      { source_vessel: 'VELES', remaining_tons: 1200 },
    ]);
  });

  it('hypothesis 11: a layer written between the read and the batch → batch.stale, discharge not applied', async () => {
    // Another writer takes 1 t off VELES after discharge() has read the layers.
    const racing: Db = {
      execute: (sql: string, params?: SqlValue[]) => db.execute(sql, params),
      select: <T>(sql: string, params?: SqlValue[]) => db.select<T>(sql, params),
      transaction: <T>(fn: (tx: Db) => Promise<T>) => db.transaction(fn),
      executeBatch: async (batch: BatchStatement[]) => {
        await db.execute(
          `UPDATE cargo_layers SET remaining_tons = remaining_tons - 1 WHERE voyage_id = ? AND source_vessel = 'VELES'`,
          [voyageId],
        );
        return db.executeBatch(batch);
      },
    };

    await expect(
      new OgvService(racing).discharge({ voyage_id: voyageId, hold_id: holdId, tons: 500, event_date: '2026-05-01' }),
    ).rejects.toMatchObject({ code: 'batch.stale' });

    const [ops] = await db.select<{ c: number }>(`SELECT COUNT(*) AS c FROM operations`);
    const [allocs] = await db.select<{ c: number }>(`SELECT COUNT(*) AS c FROM discharge_allocations`);
    expect([ops!.c, allocs!.c]).toEqual([0, 0]);
    expect(await ogv.availableBySource(voyageId)).toEqual([
      { source_vessel: 'DIANA MARIA', remaining_tons: 1600 },
      { source_vessel: 'VELES', remaining_tons: 1199 },
    ]);
  });
});

describe('OgvService — D6: insufficient cargo is a coded error (S-4 rejection)', () => {
  let db: NodeDb;
  let voyageId: string;
  let holdIds: string[];

  async function layerState(): Promise<{ id: string; remaining_tons: number; layer_status: string }[]> {
    return db.select(`SELECT id, remaining_tons, layer_status FROM cargo_layers ORDER BY id`);
  }

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, {
      vesselName: 'NORD STAR',
      holdNos: KAVKAZ_IV_HOLDS.map((h) => h.hold_no),
    });
    holdIds = seed.holdIds;
    voyageId = (await new VoyageService(db, NOOP_AUTO_BACKUP).create({
      vessel_id: seed.vesselId, voyage_no: 'NS-1',
    })).id;
    const lots = new CargoLotService(db);
    for (const [i, h] of KAVKAZ_IV_HOLDS.entries()) {
      await lots.add({
        voyage_id: voyageId, source_vessel: 'BARGE', cargo_id: seed.cargoId,
        hold_id: holdIds[i]!, sf: h.sf, planned_tons: h.loaded_tons, loaded_tons: h.loaded_tons,
      });
    }
  });

  afterEach(() => {
    db.close();
  });

  it('4003 t from hold 3 (4002 t aboard) → ogv.insufficient_cargo { hold_no: 3, short_tons ≈ 1 }, layers untouched', async () => {
    const hold3 = KAVKAZ_IV_HOLDS.findIndex((h) => h.hold_no === 3);
    const before = await layerState();

    const e = await new OgvService(db)
      .discharge({ voyage_id: voyageId, hold_id: holdIds[hold3]!, tons: 4003, event_date: '2026-05-01' })
      .then(() => new Error('promise resolved instead of rejecting'), (err: unknown) => err);

    expect(e).toBeInstanceOf(AppError);
    expect((e as AppError).code).toBe('ogv.insufficient_cargo');
    expect((e as AppError).params.hold_no).toBe(3);
    expect((e as AppError).params.short_tons).toBeCloseTo(1, 3);
    expect(await layerState()).toEqual(before);
    const [ops] = await db.select<{ c: number }>(`SELECT COUNT(*) AS c FROM operations`);
    expect(ops!.c).toBe(0);
  });
});
