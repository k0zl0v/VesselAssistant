import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dumpAllTables } from '../BackupService';
import { CargoLotService } from '../CargoLotService';
import type { NodeDb } from '../db-node';
import { AppError } from '../errors';
import { OgvService } from '../OgvService';
import { SessionService, type OperatorRole } from '../SessionService';
import { SofService } from '../SofService';
import { VoyageService } from '../VoyageService';
import { withVoyageGuard } from '../voyageGuard';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';

async function overrideReason(db: NodeDb): Promise<string | null> {
  const rows = await db.select<{ override_reason: string | null }>(
    `SELECT override_reason FROM app_session WHERE id = 1`,
  );
  return rows[0]?.override_reason ?? null;
}

async function rejection(p: Promise<unknown>): Promise<AppError> {
  const e = await p.then(
    () => {
      throw new Error('promise resolved instead of rejecting');
    },
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(AppError);
  return e as AppError;
}

describe('withVoyageGuard', () => {
  let db: NodeDb;
  let voyages: VoyageService;
  let voyageId: string;

  async function setUp(session: { operator_role: OperatorRole } | null): Promise<void> {
    db = await openTestDb({ session: null });
    if (session) {
      await new SessionService(db).start({ operator_name: 'Ivan Petrov', operator_role: session.operator_role });
    }
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    voyages = new VoyageService(db, NOOP_AUTO_BACKUP);
    voyageId = (await voyages.create({ vessel_id: seed.vesselId, voyage_no: 'NS-7' })).id;
  }

  afterEach(() => {
    db.close();
  });

  it('unknown voyage → voyage.not_found with the id; fn not called', async () => {
    await setUp({ operator_role: 'supervisor' });
    const fn = vi.fn(async () => 'x');
    const e = await rejection(withVoyageGuard(db, 'no-such-voyage', undefined, fn));
    expect(e.code).toBe('voyage.not_found');
    expect(e.params).toEqual({ voyage_id: 'no-such-voyage' });
    expect(fn).not.toHaveBeenCalled();
  });

  it('open voyage → fn runs and its result is returned, no reason needed', async () => {
    await setUp({ operator_role: 'operator' });
    const fn = vi.fn(async () => 42);
    await expect(withVoyageGuard(db, voyageId, undefined, fn)).resolves.toBe(42);
    expect(fn).toHaveBeenCalledOnce();
    expect(await overrideReason(db)).toBeNull();
  });

  describe('closed voyage', () => {
    it('no session → voyage.closed with voyage_no', async () => {
      await setUp(null);
      await voyages.close(voyageId);
      const fn = vi.fn(async () => undefined);
      const e = await rejection(withVoyageGuard(db, voyageId, { closed_voyage_reason: 'fix' }, fn));
      expect(e.code).toBe('voyage.closed');
      expect(e.params).toEqual({ voyage_no: 'NS-7' });
      expect(fn).not.toHaveBeenCalled();
    });

    it.each<OperatorRole>(['operator', 'viewer'])('role %s → voyage.closed even with a reason', async (role) => {
      await setUp({ operator_role: role });
      await voyages.close(voyageId);
      const fn = vi.fn(async () => undefined);
      const e = await rejection(withVoyageGuard(db, voyageId, { closed_voyage_reason: 'fix' }, fn));
      expect(e.code).toBe('voyage.closed');
      expect(fn).not.toHaveBeenCalled();
    });

    it.each([undefined, '', '   '])('supervisor with reason %j → voyage.closed_reason_required', async (reason) => {
      await setUp({ operator_role: 'supervisor' });
      await voyages.close(voyageId);
      const fn = vi.fn(async () => undefined);
      const opts = reason === undefined ? undefined : { closed_voyage_reason: reason };
      const e = await rejection(withVoyageGuard(db, voyageId, opts, fn));
      expect(e.code).toBe('voyage.closed_reason_required');
      expect(fn).not.toHaveBeenCalled();
      expect(await overrideReason(db)).toBeNull();
    });

    it.each<OperatorRole>(['supervisor', 'admin'])(
      '%s with a reason → fn sees override_reason, cleared afterwards',
      async (role) => {
        await setUp({ operator_role: role });
        await voyages.close(voyageId);
        let seenInside: string | null = null;
        const result = await withVoyageGuard(db, voyageId, { closed_voyage_reason: 'late SOF fix' }, async () => {
          seenInside = await overrideReason(db);
          return 'done';
        });
        expect(result).toBe('done');
        expect(seenInside).toBe('late SOF fix');
        expect(await overrideReason(db)).toBeNull();
      },
    );

    it('override_reason is cleared when fn throws, and the error propagates', async () => {
      await setUp({ operator_role: 'supervisor' });
      await voyages.close(voyageId);
      const boom = new Error('boom');
      await expect(
        withVoyageGuard(db, voyageId, { closed_voyage_reason: 'late SOF fix' }, async () => {
          throw boom;
        }),
      ).rejects.toBe(boom);
      expect(await overrideReason(db)).toBeNull();
    });
  });
});

describe('S-13 step 5: every mutating entry point rejects a closed voyage', () => {
  const AT = new Date('2026-05-10T00:00:00Z');
  let db: NodeDb;
  let lots: CargoLotService;
  let ogv: OgvService;
  let sof: SofService;
  let voyageId: string;
  let holdId: string;
  let cargoId: string;
  let sofId: string;

  beforeEach(async () => {
    db = await openTestDb();
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    holdId = seed.holdIds[0]!;
    cargoId = seed.cargoId;
    const voyages = new VoyageService(db, NOOP_AUTO_BACKUP);
    voyageId = (await voyages.create({ vessel_id: seed.vesselId, voyage_no: 'NS-13' })).id;
    lots = new CargoLotService(db);
    ogv = new OgvService(db);
    sof = new SofService(db);
    await lots.add({
      voyage_id: voyageId, source_vessel: 'DIANA MARIA', cargo_id: cargoId,
      hold_id: holdId, sf: 1.25, planned_tons: 1600, loaded_tons: 1600,
    });
    sofId = (await sof.create({ voyage_id: voyageId, event_date: '2026-05-01', description: 'pre' })).id;
    await voyages.close(voyageId);
  });

  afterEach(() => {
    db.close();
  });

  const mutations: [string, () => Promise<unknown>][] = [
    ['CargoLotService.add', () => lots.add({
      voyage_id: voyageId, source_vessel: 'VELES', cargo_id: cargoId,
      hold_id: holdId, sf: 1.25, planned_tons: 50, loaded_tons: 50,
    })],
    ['OgvService.discharge', () => ogv.discharge({
      voyage_id: voyageId, hold_id: holdId, tons: 10, event_date: '2026-05-02',
    })],
    ['SofService.create', () => sof.create({ voyage_id: voyageId, event_date: '2026-05-02', description: 'post' })],
    ['SofService.update', () => sof.update(sofId, { description: 'edited' })],
    ['SofService.delete', () => sof.delete(sofId)],
  ];

  it.each(mutations)('operator: %s → voyage.closed, dump unchanged', async (_name, call) => {
    const before = await dumpAllTables(db, AT);
    const e = await rejection(call());
    expect(e.code).toBe('voyage.closed');
    expect(e.params).toEqual({ voyage_no: 'NS-13' });
    expect(await dumpAllTables(db, AT)).toBe(before);
  });
});
