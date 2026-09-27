import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CargoLotService } from '../CargoLotService';
import { OgvService } from '../OgvService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';
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
    ).rejects.toThrow(/Insufficient cargo/);

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
});
