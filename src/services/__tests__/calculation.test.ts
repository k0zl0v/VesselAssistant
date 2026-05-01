import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CalculationService } from '../CalculationService';
import { CargoLotService } from '../CargoLotService';
import { OgvService } from '../OgvService';
import { VoyageService } from '../VoyageService';
import { openTestDb } from './helpers';
import type { NodeDb } from '../db-node';

/**
 * Seed a vessel with one or more holds with explicit volumes,
 * one or more cargoes, and a voyage. Returns ids for downstream use.
 */
async function setupVoyage(
  db: NodeDb,
  spec: {
    vesselName: string;
    voyageNo: string;
    holds: { hold_no: number; volume_m3: number }[];
    cargoes: string[];
  },
): Promise<{
  vesselId: string;
  voyageId: string;
  holdIds: string[];
  cargoIds: Record<string, string>;
}> {
  const vesselId = crypto.randomUUID();
  await db.execute(
    `INSERT INTO vessels (id, name) VALUES (?, ?)`,
    [vesselId, spec.vesselName],
  );

  const cargoIds: Record<string, string> = {};
  for (const cargoName of spec.cargoes) {
    const id = crypto.randomUUID();
    cargoIds[cargoName] = id;
    await db.execute(`INSERT INTO cargoes (id, name) VALUES (?, ?)`, [id, cargoName]);
  }

  const holdIds: string[] = [];
  for (const h of spec.holds) {
    const id = crypto.randomUUID();
    holdIds.push(id);
    await db.execute(
      `INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES (?, ?, ?, ?)`,
      [id, vesselId, h.hold_no, h.volume_m3],
    );
  }

  const voyages = new VoyageService(db);
  const voyage = await voyages.create({
    vessel_id: vesselId,
    voyage_no: spec.voyageNo,
  });

  return { vesselId, voyageId: voyage.id, holdIds, cargoIds };
}

async function setHoldParams(
  db: NodeDb,
  opts: {
    voyage_id: string;
    vessel_id: string;
    hold_id: string;
    cargo_id: string;
    sf: number;
    fill_percent?: number;
    protein_percent?: number | null;
  },
): Promise<void> {
  await db.execute(
    `INSERT INTO hold_cargo_parameters
       (id, voyage_id, vessel_id, hold_id, cargo_id, protein_percent, sf, fill_percent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      opts.voyage_id,
      opts.vessel_id,
      opts.hold_id,
      opts.cargo_id,
      opts.protein_percent ?? null,
      opts.sf,
      opts.fill_percent ?? 0.98,
    ],
  );
}

describe('CalculationService — basic per-hold view', () => {
  let db: NodeDb;
  let calc: CalculationService;

  beforeEach(async () => {
    db = await openTestDb();
    calc = new CalculationService(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns one row per hold even when no lots loaded', async () => {
    const { voyageId } = await setupVoyage(db, {
      vesselName: 'NORD STAR',
      voyageNo: 'V-1',
      holds: [
        { hold_no: 1, volume_m3: 1000 },
        { hold_no: 2, volume_m3: 1500 },
      ],
      cargoes: [],
    });

    const result = await calc.calculate(voyageId);
    expect(result.holds).toHaveLength(2);
    expect(result.holds.map((h) => h.hold_no)).toEqual([1, 2]);
    expect(result.holds.every((h) => h.loaded_tons === 0)).toBe(true);
    expect(result.totals).toEqual({
      on_board: 0,
      total_loaded: 0,
      total_discharged: 0,
      total_empty_100: 0,
      total_empty_98: 0,
    });
  });

  it('leaves capacity null when SF is not configured for a hold', async () => {
    const { voyageId } = await setupVoyage(db, {
      vesselName: 'NORD STAR',
      voyageNo: 'V-2',
      holds: [{ hold_no: 1, volume_m3: 1000 }],
      cargoes: [],
    });

    const result = await calc.calculate(voyageId);
    expect(result.holds[0]).toMatchObject({
      sf: null,
      capacity_tons_100: null,
      capacity_tons_98: null,
      empty_space_100: null,
      empty_space_98: null,
    });
  });

  it('AT-11: per-hold SF for the same cargo gives different empty space', async () => {
    const { voyageId, vesselId, holdIds, cargoIds } = await setupVoyage(db, {
      vesselName: 'NORD STAR',
      voyageNo: 'V-3',
      holds: [
        { hold_no: 1, volume_m3: 10000 },
        { hold_no: 2, volume_m3: 10000 },
      ],
      cargoes: ['WHEAT'],
    });
    await setHoldParams(db, {
      voyage_id: voyageId, vessel_id: vesselId,
      hold_id: holdIds[0]!, cargo_id: cargoIds['WHEAT']!,
      sf: 1.226,
    });
    await setHoldParams(db, {
      voyage_id: voyageId, vessel_id: vesselId,
      hold_id: holdIds[1]!, cargo_id: cargoIds['WHEAT']!,
      sf: 1.30,
    });

    const result = await calc.calculate(voyageId);
    // Hold 1: 10000 * 0.98 / 1.226 = 7993.4747...
    expect(result.holds[0]!.capacity_tons_98).toBeCloseTo(7993.4747, 3);
    // Hold 2: 10000 * 0.98 / 1.30  = 7538.4615...
    expect(result.holds[1]!.capacity_tons_98).toBeCloseTo(7538.4615, 3);
    expect(result.holds[0]!.capacity_tons_98).not.toBe(
      result.holds[1]!.capacity_tons_98,
    );
  });
});

describe('CalculationService — Appendix C regression baseline (KAVKAZ IV)', async () => {
  // Lazy import so test files in this dir share the fixture nicely.
  const { KAVKAZ_IV_HOLDS, KAVKAZ_IV_TOTALS } = await import('../../fixtures/kavkaz-iv');

  let db: NodeDb;
  let calc: CalculationService;
  let result: Awaited<ReturnType<CalculationService['calculate']>>;

  beforeEach(async () => {
    db = await openTestDb();
    const setup = await setupVoyage(db, {
      vesselName: 'KAVKAZ IV',
      voyageNo: 'BASELINE',
      holds: KAVKAZ_IV_HOLDS.map((h) => ({
        hold_no: h.hold_no,
        volume_m3: h.volume_m3,
      })),
      cargoes: ['SFM', 'WHEAT'],
    });

    const lots = new CargoLotService(db);
    const ogv = new OgvService(db);

    for (let i = 0; i < KAVKAZ_IV_HOLDS.length; i++) {
      const h = KAVKAZ_IV_HOLDS[i]!;
      const holdId = setup.holdIds[i]!;
      await setHoldParams(db, {
        voyage_id: setup.voyageId,
        vessel_id: setup.vesselId,
        hold_id: holdId,
        cargo_id: setup.cargoIds[h.cargo]!,
        sf: h.sf,
      });

      // Single aggregated lot per hold — the per-source breakdown
      // doesn't affect aggregate totals; LIFO is tested elsewhere.
      await lots.add({
        voyage_id: setup.voyageId,
        source_vessel: 'BASELINE-AGG',
        cargo_id: setup.cargoIds[h.cargo]!,
        hold_id: holdId,
        sf: h.sf,
        planned_tons: h.loaded_tons,
        loaded_tons: h.loaded_tons,
      });

      if (h.discharged_tons > 0) {
        await ogv.discharge({
          voyage_id: setup.voyageId,
          hold_id: holdId,
          tons: h.discharged_tons,
          event_date: '2026-05-01',
        });
      }
    }

    calc = new CalculationService(db);
    result = await calc.calculate(setup.voyageId);
  });

  afterEach(() => {
    db.close();
  });

  const TOL = 0.001;

  it('On Board = 23683.955', () => {
    expect(result.totals.on_board).toBeCloseTo(KAVKAZ_IV_TOTALS.on_board, 3);
  });

  it('Total Loaded = 25684.955', () => {
    expect(result.totals.total_loaded).toBeCloseTo(KAVKAZ_IV_TOTALS.total_loaded, 3);
  });

  it('Total Discharged = 2001', () => {
    expect(result.totals.total_discharged).toBeCloseTo(KAVKAZ_IV_TOTALS.total_discharged, 3);
  });

  it('Total Empty Space 100% ≈ 16689.390', () => {
    expect(result.totals.total_empty_100).toBeCloseTo(KAVKAZ_IV_TOTALS.total_empty_100, 3);
  });

  it('Total Empty Space 98% = 15881.924 (rounded)', () => {
    expect(result.totals.total_empty_98).toBeCloseTo(KAVKAZ_IV_TOTALS.total_empty_98, 3);
  });

  it('matches per-hold remain / capacity / empty-space from the original Excel', () => {
    for (const expected of KAVKAZ_IV_HOLDS) {
      const actual = result.holds.find((h) => h.hold_no === expected.hold_no)!;
      expect(actual, `hold ${expected.hold_no}`).toBeTruthy();
      expect(actual.remain_tons).toBeCloseTo(expected.expected.remain_tons, 3);
      expect(actual.capacity_tons_100!).toBeCloseTo(expected.expected.capacity_tons_100, TOL);
      expect(actual.capacity_tons_98!).toBeCloseTo(expected.expected.capacity_tons_98, TOL);
      expect(actual.empty_space_100!).toBeCloseTo(expected.expected.empty_space_100, TOL);
      expect(actual.empty_space_98!).toBeCloseTo(expected.expected.empty_space_98, TOL);
    }
  });
});
