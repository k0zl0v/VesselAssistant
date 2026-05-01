import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CargoLotService, OVERLOAD_ERROR_PREFIX } from '../CargoLotService';
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

  it('auto-creates hold_cargo_parameters on the first lot per (voyage, hold, cargo)', async () => {
    await lots.add({
      voyage_id: voyageId, source_vessel: 'A', cargo_id: cargoId,
      hold_id: holdIds[0]!, sf: 1.44, planned_tons: 100, loaded_tons: 100,
      protein_percent: 12.5,
    });

    const params = await db.select<{ sf: number; fill_percent: number; protein_percent: number | null }>(
      `SELECT sf, fill_percent, protein_percent FROM hold_cargo_parameters
        WHERE voyage_id = ? AND hold_id = ? AND cargo_id = ?`,
      [voyageId, holdIds[0]!, cargoId],
    );
    expect(params).toHaveLength(1);
    expect(params[0]).toEqual({ sf: 1.44, fill_percent: 0.98, protein_percent: 12.5 });

    // Second lot in the same hold uses a different SF — but params row
    // should NOT be overwritten (one SF per hold, like the Excel original).
    await lots.add({
      voyage_id: voyageId, source_vessel: 'B', cargo_id: cargoId,
      hold_id: holdIds[0]!, sf: 1.50, planned_tons: 200, loaded_tons: 200,
    });

    const after = await db.select<{ sf: number }>(
      `SELECT sf FROM hold_cargo_parameters
        WHERE voyage_id = ? AND hold_id = ? AND cargo_id = ?`,
      [voyageId, holdIds[0]!, cargoId],
    );
    expect(after).toHaveLength(1);
    expect(after[0]!.sf).toBe(1.44);
  });

  // AT-05 (TZ §12) + TZ §8 rule 2 — overload guard.
  // For these tests we want a tight hold so capacity numbers are small:
  // volume_m3 = 1000, sf=1.25, fill=0.98 → capacity = 784 t.
  describe('AT-05 overload guard', () => {
    let smallVoyageId: string;
    let smallHoldIds: string[];
    let smallCargoId: string;

    beforeEach(async () => {
      const seed = await seedReferenceData(db, {
        vesselName: 'TIGHT BARGE',
        holdNos: [1, 2],
        holdVolumeM3: 1000,
      });
      smallHoldIds = seed.holdIds;
      smallCargoId = seed.cargoId;
      const voyages = new VoyageService(db);
      const v = await voyages.create({
        vessel_id: seed.vesselId,
        voyage_no: 'VY-AT05',
      });
      smallVoyageId = v.id;
    });

    it('fits exactly at 98% capacity → succeeds without acknowledge', async () => {
      const lot = await lots.add({
        voyage_id: smallVoyageId,
        source_vessel: 'A',
        cargo_id: smallCargoId,
        hold_id: smallHoldIds[0]!,
        sf: 1.25,
        planned_tons: 784,
        loaded_tons: 784,
      });
      expect(lot.loaded_tons).toBe(784);
    });

    it('overshoot → throws OVERLOAD with the right overshoot tons', async () => {
      // Pre-load 500 t. Capacity = 784. Adding 285 → projected 785 → overshoot 1 t.
      await lots.add({
        voyage_id: smallVoyageId, source_vessel: 'A', cargo_id: smallCargoId,
        hold_id: smallHoldIds[0]!, sf: 1.25, planned_tons: 500, loaded_tons: 500,
      });

      let caught: unknown;
      try {
        await lots.add({
          voyage_id: smallVoyageId, source_vessel: 'B', cargo_id: smallCargoId,
          hold_id: smallHoldIds[0]!, sf: 1.25, planned_tons: 285, loaded_tons: 285,
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(Error);
      const msg = (caught as Error).message;
      expect(msg.startsWith(OVERLOAD_ERROR_PREFIX)).toBe(true);
      const payload = JSON.parse(msg.slice(OVERLOAD_ERROR_PREFIX.length));
      expect(payload.overloads).toBe(true);
      expect(payload.hold_id).toBe(smallHoldIds[0]!);
      expect(payload.overshoot_tons).toBeCloseTo(1, 3);
      expect(payload.capacity_tons).toBeCloseTo(784, 3);

      // The refused lot must NOT have been persisted.
      const rows = await db.select<{ c: number }>(
        `SELECT COUNT(*) AS c FROM cargo_lots
          WHERE voyage_id = ? AND hold_id = ? AND source_vessel = 'B'`,
        [smallVoyageId, smallHoldIds[0]!],
      );
      expect(rows[0]!.c).toBe(0);
    });

    it('acknowledge_overload=true → lot is persisted past capacity', async () => {
      await lots.add({
        voyage_id: smallVoyageId, source_vessel: 'A', cargo_id: smallCargoId,
        hold_id: smallHoldIds[0]!, sf: 1.25, planned_tons: 500, loaded_tons: 500,
      });
      const lot = await lots.add({
        voyage_id: smallVoyageId, source_vessel: 'B', cargo_id: smallCargoId,
        hold_id: smallHoldIds[0]!, sf: 1.25, planned_tons: 285, loaded_tons: 285,
        acknowledge_overload: true,
      });
      expect(lot.loaded_tons).toBe(285);

      const rows = await db.select<{ remain: number | null }>(
        `SELECT COALESCE(SUM(remaining_tons), 0) AS remain
           FROM cargo_layers WHERE voyage_id = ? AND hold_id = ?`,
        [smallVoyageId, smallHoldIds[0]!],
      );
      expect(rows[0]!.remain).toBeCloseTo(785, 3);
    });

    it("uses the lot's incoming SF, not hold_cargo_parameters.sf", async () => {
      // First lot uses sf=1.25 → records hold_cargo_parameters.sf=1.25.
      // capacity at sf=1.25 → 784 t. After 500 t we have 284 t headroom.
      await lots.add({
        voyage_id: smallVoyageId, source_vessel: 'A', cargo_id: smallCargoId,
        hold_id: smallHoldIds[0]!, sf: 1.25, planned_tons: 500, loaded_tons: 500,
      });

      // Second lot declares a denser sf=2.0 → capacity at sf=2.0 = 490 t.
      // Adding ANY tons would overshoot since current remain (500) already
      // exceeds 490 — proves the guard reads the lot's SF, not the stored one.
      await expect(
        lots.add({
          voyage_id: smallVoyageId, source_vessel: 'B', cargo_id: smallCargoId,
          hold_id: smallHoldIds[0]!, sf: 2.0, planned_tons: 1, loaded_tons: 1,
        }),
      ).rejects.toThrow(/^OVERLOAD:/);

      // And conversely with sf=0.5 (capacity 1960 t) the same 1 t fits even
      // though hold_cargo_parameters.sf is 1.25.
      const ok = await lots.add({
        voyage_id: smallVoyageId, source_vessel: 'C', cargo_id: smallCargoId,
        hold_id: smallHoldIds[0]!, sf: 0.5, planned_tons: 1, loaded_tons: 1,
      });
      expect(ok.loaded_tons).toBe(1);
    });
  });

  it('rejects SF <= 0 (caught by overload-guard division-by-zero check)', async () => {
    // The overload guard runs `capacityTons` before the INSERT, so SF=0 is
    // rejected there with the helper's own message. (The SQL CHECK
    // constraint on cargo_lots.sf is still in place as a defence-in-depth
    // belt; we just never reach it for the SF=0 case.)
    await expect(
      lots.add({
        voyage_id: voyageId, source_vessel: 'X', cargo_id: cargoId,
        hold_id: holdIds[0]!, sf: 0, planned_tons: 100, loaded_tons: 100,
      }),
    ).rejects.toThrow(/SF must be > 0/);
  });
});
