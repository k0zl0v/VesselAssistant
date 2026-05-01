import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CargoLotService } from '../CargoLotService';
import { VoyageService } from '../VoyageService';
import { openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';

describe('CargoLotService — integration', () => {
  let db: NodeDb;
  let lots: CargoLotService;
  let voyageId: string;
  let holdIds: string[];
  let cargoId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, {
      vesselName: 'KAVKAZ IV',
      holdNos: [1, 2, 3],
    });
    holdIds = seed.holdIds;
    cargoId = seed.cargoId;

    const voyages = new VoyageService(db);
    const voyage = await voyages.create({
      vessel_id: seed.vesselId,
      voyage_no: 'VY-1',
    });
    voyageId = voyage.id;

    lots = new CargoLotService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('adds a lot and creates a matching cargo_layers row', async () => {
    const lot = await lots.add({
      voyage_id: voyageId,
      source_vessel: 'DIANA MARIA',
      cargo_id: cargoId,
      hold_id: holdIds[0]!,
      sf: 1.25,
      planned_tons: 1600,
      loaded_tons: 1600,
      protein_percent: 12.5,
    });

    expect(lot.load_sequence).toBe(1);
    expect(lot.source_vessel).toBe('DIANA MARIA');

    const layers = await db.select<{
      cargo_lot_id: string;
      remaining_tons: number;
      load_sequence: number;
    }>(
      `SELECT cargo_lot_id, remaining_tons, load_sequence
         FROM cargo_layers WHERE cargo_lot_id = ?`,
      [lot.id],
    );
    expect(layers).toHaveLength(1);
    expect(layers[0]!.remaining_tons).toBe(1600);
    expect(layers[0]!.load_sequence).toBe(1);
  });

  it('assigns increasing load_sequence per (voyage, hold)', async () => {
    const lot1 = await lots.add({
      voyage_id: voyageId,
      source_vessel: 'DIANA MARIA',
      cargo_id: cargoId,
      hold_id: holdIds[0]!,
      sf: 1.25,
      planned_tons: 1600,
      loaded_tons: 1600,
    });
    const lot2 = await lots.add({
      voyage_id: voyageId,
      source_vessel: 'VELES',
      cargo_id: cargoId,
      hold_id: holdIds[0]!,
      sf: 1.25,
      planned_tons: 1200,
      loaded_tons: 1200,
    });
    // Different hold restarts the sequence.
    const lot3 = await lots.add({
      voyage_id: voyageId,
      source_vessel: 'DIANA MARIA',
      cargo_id: cargoId,
      hold_id: holdIds[1]!,
      sf: 1.25,
      planned_tons: 800,
      loaded_tons: 800,
    });

    expect(lot1.load_sequence).toBe(1);
    expect(lot2.load_sequence).toBe(2);
    expect(lot3.load_sequence).toBe(1);
  });

  it('listByHold returns lots ordered by load_sequence ascending', async () => {
    await lots.add({
      voyage_id: voyageId, source_vessel: 'A', cargo_id: cargoId,
      hold_id: holdIds[0]!, sf: 1.25, planned_tons: 100, loaded_tons: 100,
    });
    await lots.add({
      voyage_id: voyageId, source_vessel: 'B', cargo_id: cargoId,
      hold_id: holdIds[0]!, sf: 1.25, planned_tons: 200, loaded_tons: 200,
    });
    await lots.add({
      voyage_id: voyageId, source_vessel: 'C', cargo_id: cargoId,
      hold_id: holdIds[0]!, sf: 1.25, planned_tons: 300, loaded_tons: 300,
    });

    const list = await lots.listByHold(voyageId, holdIds[0]!);
    expect(list.map((l) => l.source_vessel)).toEqual(['A', 'B', 'C']);
    expect(list.map((l) => l.load_sequence)).toEqual([1, 2, 3]);
  });

  it('rejects SF <= 0 via CHECK constraint', async () => {
    await expect(
      lots.add({
        voyage_id: voyageId, source_vessel: 'X', cargo_id: cargoId,
        hold_id: holdIds[0]!, sf: 0, planned_tons: 100, loaded_tons: 100,
      }),
    ).rejects.toThrow(/CHECK/);
  });
});
