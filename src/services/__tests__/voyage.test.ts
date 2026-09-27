import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoBackupTrigger } from '../AutoBackupService';
import { CargoLotService } from '../CargoLotService';
import { AppError, isAppError } from '../errors';
import { OgvService } from '../OgvService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';
import type { SqlValue } from '../db';

describe('VoyageService — integration', () => {
  let db: NodeDb;
  let svc: VoyageService;
  let vesselId: string;

  beforeEach(async () => {
    db = await openTestDb();
    svc = new VoyageService(db, NOOP_AUTO_BACKUP);
    const seed = await seedReferenceData(db, {
      vesselName: 'NORD STAR',
      holdNos: [],
    });
    vesselId = seed.vesselId;
  });

  afterEach(() => {
    db.close();
  });

  it('creates a voyage and reads it back', async () => {
    const voyage = await svc.create({
      vessel_id: vesselId,
      voyage_no: 'V-001',
    });

    expect(voyage.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(voyage.vessel_id).toBe(vesselId);
    expect(voyage.voyage_no).toBe('V-001');
    expect(voyage.status).toBe('open');

    const fetched = await svc.get(voyage.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.voyage_no).toBe('V-001');
  });

  it('lists voyages for a vessel in voyage_no DESC order', async () => {
    await svc.create({ vessel_id: vesselId, voyage_no: 'V-001' });
    await svc.create({ vessel_id: vesselId, voyage_no: 'V-002' });
    await svc.create({ vessel_id: vesselId, voyage_no: 'V-003' });

    const list = await svc.listByVessel(vesselId);
    expect(list).toHaveLength(3);
    expect(list.map((v) => v.voyage_no)).toEqual(['V-003', 'V-002', 'V-001']);
  });

  it('closes an open voyage and rejects duplicate close attempts as no-op', async () => {
    const voyage = await svc.create({
      vessel_id: vesselId,
      voyage_no: 'V-100',
    });

    await svc.close(voyage.id);
    expect((await svc.get(voyage.id))!.status).toBe('closed');

    // closing twice does not raise — the second call is a no-op (idempotent).
    await svc.close(voyage.id);
    expect((await svc.get(voyage.id))!.status).toBe('closed');
  });

  it('rejects duplicate (vessel_id, voyage_no) by FK/UNIQUE', async () => {
    await svc.create({ vessel_id: vesselId, voyage_no: 'V-DUP' });
    await expect(
      svc.create({ vessel_id: vesselId, voyage_no: 'V-DUP' }),
    ).rejects.toThrow(/UNIQUE/);
  });

  describe('auto-backup before close (FR-14)', () => {
    it('close() snapshots close_voyage while the voyage is still open, then closes it', async () => {
      const voyage = await svc.create({ vessel_id: vesselId, voyage_no: 'V-200' });
      const statusAtSnapshot: string[] = [];
      const hook = {
        snapshot: vi.fn(async (_trigger: AutoBackupTrigger) => {
          statusAtSnapshot.push((await svc.get(voyage.id))!.status);
        }),
      };

      await new VoyageService(db, hook).close(voyage.id);

      expect(hook.snapshot).toHaveBeenCalledTimes(1);
      expect(hook.snapshot).toHaveBeenCalledWith('close_voyage');
      expect(statusAtSnapshot).toEqual(['open']);
      expect((await svc.get(voyage.id))!.status).toBe('closed');
    });

    it('a throwing hook rejects close() and leaves the voyage open', async () => {
      const voyage = await svc.create({ vessel_id: vesselId, voyage_no: 'V-201' });
      const hook = { snapshot: vi.fn(async () => Promise.reject(new Error('disk full'))) };

      await expect(new VoyageService(db, hook).close(voyage.id)).rejects.toThrow('disk full');
      expect((await svc.get(voyage.id))!.status).toBe('open');
    });

    it('closing an already closed voyage takes no snapshot', async () => {
      const voyage = await svc.create({ vessel_id: vesselId, voyage_no: 'V-202' });
      await svc.close(voyage.id);
      const hook = { snapshot: vi.fn(async () => undefined) };

      await new VoyageService(db, hook).close(voyage.id);
      expect(hook.snapshot).not.toHaveBeenCalled();
    });
  });

  describe('copy (FR-01, D4)', () => {
    const HCP_COLS = 'vessel_id, hold_id, cargo_id, protein_percent, sf, fill_percent';

    async function seedSourceVoyage(): Promise<string> {
      const seed = await seedReferenceData(db, { vesselName: 'VELES', holdNos: [1, 2] });
      await db.execute(`INSERT INTO ports (id, name) VALUES ('p-load', 'NOVOROSSIYSK'), ('p-dis', 'IZMIR')`);
      const source = await new VoyageService(db, NOOP_AUTO_BACKUP).create({
        vessel_id: seed.vesselId,
        voyage_no: 'V-001',
        loading_port_id: 'p-load',
        discharging_port_id: 'p-dis',
      });
      await db.execute(
        `UPDATE voyages SET arrived_at = '2026-05-01T06:00', nor_at = '2026-05-01T07:00', berthed_at = '2026-05-01T08:00',
                operations_started_at = '2026-05-01T09:00', operations_ended_at = '2026-05-02T09:00', departed_at = '2026-05-02T12:00'
          WHERE id = ?`,
        [source.id],
      );
      const lots = new CargoLotService(db);
      for (const [i, hold_id] of seed.holdIds.entries()) {
        await lots.add({
          voyage_id: source.id,
          source_vessel: 'DIANA MARIA',
          cargo_id: seed.cargoId,
          hold_id,
          protein_percent: i === 0 ? 12.5 : null,
          sf: 1.25 + i / 10,
          planned_tons: 1000,
          loaded_tons: 1000,
        });
      }
      await new OgvService(db).discharge({ voyage_id: source.id, hold_id: seed.holdIds[0]!, tons: 100, event_date: '2026-05-02' });
      await db.execute(`INSERT INTO sof_events (id, voyage_id, event_date, category) VALUES ('sof-1', ?, '2026-05-01', 'nor')`, [
        source.id,
      ]);
      return source.id;
    }

    async function voyageRows(voyageId: string): Promise<Record<string, SqlValue[]>> {
      const out: Record<string, SqlValue[]> = {};
      for (const table of ['voyages', 'hold_cargo_parameters', 'cargo_lots', 'cargo_layers', 'operations', 'sof_events']) {
        const key = table === 'voyages' ? 'id' : 'voyage_id';
        out[table] = await db.select(`SELECT * FROM ${table} WHERE ${key} = ? ORDER BY id`, [voyageId]);
      }
      return out;
    }

    it('creates an open voyage with the same vessel and ports and no dates', async () => {
      const sourceId = await seedSourceVoyage();
      const copy = await svc.copy(sourceId, 'V-002');

      expect(copy.id).not.toBe(sourceId);
      expect(copy.voyage_no).toBe('V-002');
      expect(copy.status).toBe('open');
      const source = (await svc.get(sourceId))!;
      expect([copy.vessel_id, copy.loading_port_id, copy.discharging_port_id]).toEqual([source.vessel_id, 'p-load', 'p-dis']);
      expect([copy.arrived_at, copy.nor_at, copy.berthed_at, copy.operations_started_at, copy.operations_ended_at, copy.departed_at]).toEqual(
        [null, null, null, null, null, null],
      );
    });

    it('copies hold_cargo_parameters with new ids and nothing else', async () => {
      const sourceId = await seedSourceVoyage();
      const copy = await svc.copy(sourceId, 'V-002');

      const params = (id: string) =>
        db.select<Record<string, SqlValue>>(`SELECT ${HCP_COLS} FROM hold_cargo_parameters WHERE voyage_id = ? ORDER BY hold_id`, [id]);
      expect(await params(copy.id)).toEqual(await params(sourceId));
      expect(await params(copy.id)).toHaveLength(2);
      expect((await params(copy.id)).map((r) => r.protein_percent).sort()).toEqual([12.5, null].sort());

      const ids = (id: string) => db.select<{ id: string }>(`SELECT id FROM hold_cargo_parameters WHERE voyage_id = ?`, [id]);
      const sourceIds = new Set((await ids(sourceId)).map((r) => r.id));
      expect((await ids(copy.id)).filter((r) => sourceIds.has(r.id))).toEqual([]);

      const rows = await voyageRows(copy.id);
      expect([rows.cargo_lots, rows.cargo_layers, rows.operations, rows.sof_events].map((r) => r!.length)).toEqual([0, 0, 0, 0]);
    });

    it('copies a closed voyage and leaves the source untouched', async () => {
      const sourceId = await seedSourceVoyage();
      await svc.close(sourceId);
      const before = await voyageRows(sourceId);

      const copy = await svc.copy(sourceId, 'V-003');

      expect(copy.status).toBe('open');
      expect(await voyageRows(sourceId)).toEqual(before);
    });

    it('rejects an unknown source voyage with voyage.not_found', async () => {
      const err = await svc.copy('missing', 'V-9').then(
        () => null,
        (e: unknown) => e,
      );
      expect(isAppError(err) && [err.code, err.params]).toEqual(['voyage.not_found', { voyage_id: 'missing' }]);
    });

    it('copy() itself is atomic: a mid-batch failure injected via a spy on executeBatch leaves no partial voyage or hold_cargo_parameters row', async () => {
      const sourceId = await seedSourceVoyage();
      const priorParams = await db.select<{ id: string }>(
        `SELECT id FROM hold_cargo_parameters WHERE voyage_id = ?`,
        [sourceId],
      );
      expect(priorParams.length).toBeGreaterThanOrEqual(2); // need >1 row to prove an EARLIER hcp insert is rolled back too

      let capturedCopyId: string | undefined;
      const realExecuteBatch = db.executeBatch.bind(db);
      const spy = vi.spyOn(db, 'executeBatch').mockImplementation(async (batch) => {
        capturedCopyId = batch[0]!.params[0] as string;
        // Force the same failure copy() would hit on a stale read: an impossible
        // expectRowsAffected on the LAST statement, so every earlier INSERT already ran.
        const tampered = batch.map((stmt, i) =>
          i === batch.length - 1 ? { ...stmt, expectRowsAffected: 999 } : stmt,
        );
        return realExecuteBatch(tampered);
      });

      const err = await svc.copy(sourceId, 'V-ATOMIC-FAIL').then(
        () => null,
        (e: unknown) => e,
      );
      spy.mockRestore();

      expect(isAppError(err) && err.code).toBe('batch.stale');
      expect(await db.select(`SELECT * FROM voyages WHERE id = ?`, [capturedCopyId!])).toEqual([]);
      expect(
        await db.select(`SELECT * FROM hold_cargo_parameters WHERE voyage_id = ?`, [capturedCopyId!]),
      ).toEqual([]);
    });

    it('known-bad pole: a non-atomic executeBatch stand-in DOES leave a partial voyage row, proving the assertion above has teeth', async () => {
      const sourceId = await seedSourceVoyage();

      let capturedCopyId: string | undefined;
      const spy = vi.spyOn(db, 'executeBatch').mockImplementation(async (batch) => {
        capturedCopyId = batch[0]!.params[0] as string;
        // Simulate the exact defect executeBatch (docs/adr/0002-atomic-writes-execute-batch.md)
        // exists to rule out: statements committed one at a time, no rollback on a later failure.
        for (const [i, stmt] of batch.entries()) {
          if (i === batch.length - 1) throw new AppError('batch.stale', {});
          await db.execute(stmt.sql, stmt.params);
        }
        return [];
      });

      const err = await svc.copy(sourceId, 'V-NONATOMIC-FAIL').then(
        () => null,
        (e: unknown) => e,
      );
      spy.mockRestore();

      expect(isAppError(err) && err.code).toBe('batch.stale');
      const leftover = await db.select(`SELECT * FROM voyages WHERE id = ?`, [capturedCopyId!]);
      expect(leftover).not.toEqual([]); // the known-bad pole: a partial row survives

      await db.execute(`DELETE FROM voyages WHERE id = ?`, [capturedCopyId!]); // clean up this test's own deliberately-broken write
    });
  });
});
