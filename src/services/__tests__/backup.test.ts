import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoBackupService } from '../AutoBackupService';
import { BackupService } from '../BackupService';
import { MemoryBackupStore } from '../BackupStore';
import { isAppError } from '../errors';
import { CargoLotService } from '../CargoLotService';
import { OgvService } from '../OgvService';
import { VoyageService } from '../VoyageService';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';
import type { NodeDb } from '../db-node';
import type { SqlValue } from '../db';

interface SeededIds {
  vesselId: string;
  cargoId: string;
  holdIds: string[];
  voyageId: string;
}

async function seedFullProject(db: NodeDb): Promise<SeededIds> {
  const seed = await seedReferenceData(db, {
    vesselName: 'NORD STAR',
    holdNos: [1, 2],
    cargoName: 'Wheat',
  });

  const voyages = new VoyageService(db, NOOP_AUTO_BACKUP);
  const voyage = await voyages.create({
    vessel_id: seed.vesselId,
    voyage_no: 'V-100',
  });

  const lots = new CargoLotService(db);
  // Two lots in hold #1 (LIFO stack), one lot in hold #2.
  await lots.add({
    voyage_id: voyage.id,
    source_vessel: 'DIANA MARIA',
    cargo_id: seed.cargoId,
    hold_id: seed.holdIds[0]!,
    sf: 1.25,
    planned_tons: 1600,
    loaded_tons: 1600,
  });
  await lots.add({
    voyage_id: voyage.id,
    source_vessel: 'VELES',
    cargo_id: seed.cargoId,
    hold_id: seed.holdIds[0]!,
    sf: 1.3,
    planned_tons: 1200,
    loaded_tons: 1200,
  });
  await lots.add({
    voyage_id: voyage.id,
    source_vessel: 'DIANA MARIA',
    cargo_id: seed.cargoId,
    hold_id: seed.holdIds[1]!,
    sf: 1.25,
    planned_tons: 800,
    loaded_tons: 800,
  });

  // One discharge that spans two layers, exercising operations +
  // discharge_allocations + cargo_layers updates.
  const ogv = new OgvService(db);
  await ogv.discharge({
    voyage_id: voyage.id,
    hold_id: seed.holdIds[0]!,
    tons: 1500,
    event_date: '2026-05-01',
  });

  return {
    vesselId: seed.vesselId,
    cargoId: seed.cargoId,
    holdIds: seed.holdIds,
    voyageId: voyage.id,
  };
}

async function rowCount(db: NodeDb, table: string): Promise<number> {
  const rows = await db.select<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table}`,
  );
  return rows[0]!.n;
}

const TABLES = [
  'vessels',
  'cargoes',
  'ports',
  'cranes',
  'holds',
  'voyages',
  'hold_cargo_parameters',
  'cargo_lots',
  'cargo_layers',
  'operations',
  'discharge_allocations',
  'crane_coefficients',
  'sof_events',
  'documents',
  'audit_log',
] as const;

describe('BackupService — round-trip and modes', () => {
  let dbA: NodeDb;

  beforeEach(async () => {
    dbA = await openTestDb();
  });

  afterEach(() => {
    dbA.close();
  });

  it('round-trip: export from one DB, import into a fresh DB, all data preserved', async () => {
    const seeded = await seedFullProject(dbA);
    const backup = new BackupService(dbA, NOOP_AUTO_BACKUP);
    const json = await backup.exportToJson();

    // Capture row counts and key fact-shapes from the source DB.
    const beforeCounts: Record<string, number> = {};
    for (const t of TABLES) beforeCounts[t] = await rowCount(dbA, t);

    const lotsBefore = await dbA.select<{
      source_vessel: string;
      loaded_tons: number;
      hold_id: string;
    }>(
      `SELECT source_vessel, loaded_tons, hold_id FROM cargo_lots ORDER BY load_sequence, hold_id`,
    );
    const allocsBefore = await dbA.select<{
      source_vessel: string;
      discharged_tons: number;
    }>(
      `SELECT source_vessel, discharged_tons FROM discharge_allocations ORDER BY discharged_tons DESC`,
    );

    // Restore into a clean second DB.
    const dbB = await openTestDb();
    try {
      await new BackupService(dbB, NOOP_AUTO_BACKUP).importFromJson(json);

      for (const t of TABLES) {
        expect(await rowCount(dbB, t), `count(${t})`).toBe(beforeCounts[t]);
      }

      const lotsAfter = await dbB.select<{
        source_vessel: string;
        loaded_tons: number;
        hold_id: string;
      }>(
        `SELECT source_vessel, loaded_tons, hold_id FROM cargo_lots ORDER BY load_sequence, hold_id`,
      );
      expect(lotsAfter).toEqual(lotsBefore);

      const allocsAfter = await dbB.select<{
        source_vessel: string;
        discharged_tons: number;
      }>(
        `SELECT source_vessel, discharged_tons FROM discharge_allocations ORDER BY discharged_tons DESC`,
      );
      expect(allocsAfter).toEqual(allocsBefore);

      // The voyage record itself round-trips with the same id.
      const voyages = await dbB.select<{ id: string; voyage_no: string }>(
        `SELECT id, voyage_no FROM voyages`,
      );
      expect(voyages).toEqual([{ id: seeded.voyageId, voyage_no: 'V-100' }]);
    } finally {
      dbB.close();
    }
  });

  it('exportToJson produces a well-formed envelope with schema_version and tables', async () => {
    await seedFullProject(dbA);
    const json = await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson();
    const parsed = JSON.parse(json);

    expect(parsed.schema_version).toBe(2);
    expect(typeof parsed.exported_at).toBe('string');
    expect(parsed.tables).toBeDefined();
    for (const t of TABLES) {
      expect(Array.isArray(parsed.tables[t]), `tables.${t} is array`).toBe(true);
    }
    expect(parsed.tables.cargo_lots.length).toBe(3);
    expect(parsed.tables.discharge_allocations.length).toBeGreaterThan(0);
  });

  it('throws when schema_version does not match', async () => {
    await seedFullProject(dbA);
    const dbB = await openTestDb();
    try {
      const bad = JSON.stringify({
        schema_version: 99,
        exported_at: '2026-05-01T00:00:00Z',
        tables: {},
      });
      await expect(
        new BackupService(dbB, NOOP_AUTO_BACKUP).importFromJson(bad),
      ).rejects.toThrow(/schema_version mismatch/);
    } finally {
      dbB.close();
    }
  });

  it('wipeFirst: true deletes pre-existing rows that are not in the import', async () => {
    // Source: full seeded project.
    await seedFullProject(dbA);
    const json = await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson();

    // Target: a SECOND seeded project with different ids. After import,
    // none of those original rows should remain.
    const dbB = await openTestDb();
    try {
      const otherSeed = await seedReferenceData(dbB, {
        vesselName: 'OTHER SHIP',
        holdNos: [1],
        cargoName: 'Corn',
      });
      const otherVoyages = new VoyageService(dbB, NOOP_AUTO_BACKUP);
      const otherVoyage = await otherVoyages.create({
        vessel_id: otherSeed.vesselId,
        voyage_no: 'OTHER-1',
      });

      // Sanity: pre-import OTHER SHIP exists.
      const preVessels = await dbB.select<{ name: string }>(
        `SELECT name FROM vessels`,
      );
      expect(preVessels.map((v) => v.name)).toContain('OTHER SHIP');

      await new BackupService(dbB, NOOP_AUTO_BACKUP).importFromJson(json, { wipeFirst: true });

      // OTHER SHIP and OTHER-1 voyage are gone.
      const postVessels = await dbB.select<{ name: string }>(
        `SELECT name FROM vessels ORDER BY name`,
      );
      expect(postVessels.map((v) => v.name)).toEqual(['NORD STAR']);

      const postVoyages = await dbB.select<{ id: string; voyage_no: string }>(
        `SELECT id, voyage_no FROM voyages`,
      );
      expect(postVoyages.find((v) => v.id === otherVoyage.id)).toBeUndefined();
      expect(postVoyages.map((v) => v.voyage_no)).toEqual(['V-100']);
    } finally {
      dbB.close();
    }
  });

  it('wipeFirst: false preserves existing rows and adds imported ones (disjoint ids)', async () => {
    // Source DB has its own seeded project.
    await seedFullProject(dbA);
    const json = await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson();

    // Target DB has a completely disjoint reference set: different
    // vessel/cargo/hold ids, different voyage, no discharges yet.
    const dbB = await openTestDb();
    try {
      await seedReferenceData(dbB, {
        vesselName: 'OTHER SHIP',
        holdNos: [1],
        cargoName: 'Corn',
      });

      const before = {
        vessels: await rowCount(dbB, 'vessels'),
        cargoes: await rowCount(dbB, 'cargoes'),
        holds: await rowCount(dbB, 'holds'),
      };

      await new BackupService(dbB, NOOP_AUTO_BACKUP).importFromJson(json, { wipeFirst: false });

      // Counts should be the sum of pre-existing plus imported.
      expect(await rowCount(dbB, 'vessels')).toBe(before.vessels + 1);
      expect(await rowCount(dbB, 'cargoes')).toBe(before.cargoes + 1);
      expect(await rowCount(dbB, 'holds')).toBe(before.holds + 2);

      // Both projects' voyages coexist.
      const voyageNos = (
        await dbB.select<{ voyage_no: string }>(
          `SELECT voyage_no FROM voyages ORDER BY voyage_no`,
        )
      ).map((r) => r.voyage_no);
      expect(voyageNos).toEqual(['V-100']);
      // Note: OTHER SHIP didn't have a voyage created, only reference data.

      // The imported lots are present.
      expect(await rowCount(dbB, 'cargo_lots')).toBe(3);
    } finally {
      dbB.close();
    }
  });

  it('importFromJson keeps the existing audit_log when the snapshot carries none (D3a)', async () => {
    await seedFullProject(dbA);
    const before = await dbA.select<Record<string, SqlValue>>(`SELECT * FROM audit_log ORDER BY id`);
    expect(before.length).toBeGreaterThan(0);

    const envelope = JSON.parse(await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson());
    envelope.tables.audit_log = [];
    await new BackupService(dbA, NOOP_AUTO_BACKUP).importFromJson(JSON.stringify(envelope));

    const after = await dbA.select<Record<string, SqlValue>>(`SELECT * FROM audit_log ORDER BY id`);
    expect(after.length).toBeGreaterThanOrEqual(before.length);
    expect(after.slice(0, before.length)).toEqual(before);
  });

  it('importFromJson accepts a schema_version 1 snapshot without the operator columns', async () => {
    await seedFullProject(dbA);
    const envelope = JSON.parse(await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson());
    envelope.schema_version = 1;
    for (const row of envelope.tables.audit_log as Record<string, SqlValue>[]) {
      delete row.user_role;
      delete row.reason;
    }

    const dbB = await openTestDb();
    try {
      await new BackupService(dbB, NOOP_AUTO_BACKUP).importFromJson(JSON.stringify(envelope));
      expect(await rowCount(dbB, 'cargo_lots')).toBe(3);
      expect(await rowCount(dbB, 'audit_log')).toBe(envelope.tables.audit_log.length);
    } finally {
      dbB.close();
    }
  });
});

describe('BackupService — auto-backup before restore (FR-14)', () => {
  let dbA: NodeDb;
  let dbB: NodeDb;

  beforeEach(async () => {
    dbA = await openTestDb();
    dbB = await openTestDb();
  });

  afterEach(() => {
    dbA.close();
    dbB.close();
  });

  it('importFromJson snapshots restore while the target still holds its old data', async () => {
    await seedFullProject(dbA);
    const json = await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson();
    await seedReferenceData(dbB, { vesselName: 'OTHER SHIP', holdNos: [1] });
    const vesselsAtSnapshot: string[][] = [];
    const hook = {
      snapshot: vi.fn(async () => {
        vesselsAtSnapshot.push((await dbB.select<{ name: string }>('SELECT name FROM vessels')).map((v) => v.name));
      }),
    };

    await new BackupService(dbB, hook).importFromJson(json);

    expect(hook.snapshot).toHaveBeenCalledTimes(1);
    expect(hook.snapshot).toHaveBeenCalledWith('restore');
    expect(vesselsAtSnapshot).toEqual([['OTHER SHIP']]);
    expect((await dbB.select<{ name: string }>('SELECT name FROM vessels')).map((v) => v.name)).toEqual(['NORD STAR']);
  });

  it('a throwing hook rejects importFromJson and leaves the target untouched', async () => {
    await seedFullProject(dbA);
    const json = await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson();
    await seedReferenceData(dbB, { vesselName: 'OTHER SHIP', holdNos: [1] });
    const hook = { snapshot: vi.fn(async () => Promise.reject(new Error('disk full'))) };

    await expect(new BackupService(dbB, hook).importFromJson(json)).rejects.toThrow('disk full');
    expect((await dbB.select<{ name: string }>('SELECT name FROM vessels')).map((v) => v.name)).toEqual(['OTHER SHIP']);
  });

  it('S-10: a snapshot carrying protein 14.0 is rejected whole, before any auto-backup', async () => {
    await seedFullProject(dbA);
    const envelope = JSON.parse(await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson());
    (envelope.tables.cargo_lots as Record<string, SqlValue>[])[1]!.protein_percent = 14.0;
    await seedReferenceData(dbB, { vesselName: 'OTHER SHIP', holdNos: [1] });
    const hook = { snapshot: vi.fn(async () => undefined) };

    const err = await new BackupService(dbB, hook).importFromJson(JSON.stringify(envelope)).then(
      () => null,
      (e: unknown) => e,
    );

    expect(isAppError(err) && [err.code, err.params]).toEqual(['protein.invalid', { value: 14 }]);
    expect(hook.snapshot).not.toHaveBeenCalled();
    expect((await dbB.select<{ name: string }>('SELECT name FROM vessels')).map((v) => v.name)).toEqual(['OTHER SHIP']);
    expect(await rowCount(dbB, 'cargo_lots')).toBe(0);
  });

  it('S-11: restoring with a real AutoBackupService first writes auto-*-restore.json of the replaced state', async () => {
    await seedFullProject(dbA);
    const json = await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson();
    await seedReferenceData(dbB, { vesselName: 'OTHER SHIP', holdNos: [1] });
    const store = new MemoryBackupStore();

    await new BackupService(dbB, new AutoBackupService(dbB, store)).importFromJson(json);

    const names = (await store.list()).map((f) => f.name);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^auto-.+-restore\.json$/);
    const saved = JSON.parse(store.files.get(names[0]!)!);
    expect(saved.tables.vessels.map((v: { name: string }) => v.name)).toEqual(['OTHER SHIP']);
    expect((await dbB.select<{ name: string }>('SELECT name FROM vessels')).map((v) => v.name)).toEqual(['NORD STAR']);
  });
});

describe('BackupService.importFromJson — atomic write (ADR-0002)', () => {
  let dbA: NodeDb;
  let dbB: NodeDb;

  beforeEach(async () => {
    dbA = await openTestDb();
    dbB = await openTestDb();
  });

  afterEach(() => {
    dbA.close();
    dbB.close();
  });

  it('wipe + inserts go as one executeBatch and never through db.transaction', async () => {
    await seedFullProject(dbA);
    const json = await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson();
    const tx = vi.spyOn(dbB, 'transaction');
    const batch = vi.spyOn(dbB, 'executeBatch');
    await new BackupService(dbB, NOOP_AUTO_BACKUP).importFromJson(json);
    expect(tx).not.toHaveBeenCalled();
    expect(batch).toHaveBeenCalledOnce();
  });

  it('a failure on the last statement leaves the target exactly as before, wipe included', async () => {
    await seedFullProject(dbA);
    const json = await new BackupService(dbA, NOOP_AUTO_BACKUP).exportToJson();
    await seedReferenceData(dbB, { vesselName: 'NORD STAR', holdNos: [1] });
    const before = await dbB.select('SELECT id, name FROM vessels ORDER BY id');

    const realExecuteBatch = dbB.executeBatch.bind(dbB);
    const spy = vi.spyOn(dbB, 'executeBatch').mockImplementation(async (b) =>
      realExecuteBatch(b.map((stmt, i) => (i === b.length - 1 ? { ...stmt, expectRowsAffected: 999 } : stmt))),
    );
    await expect(new BackupService(dbB, NOOP_AUTO_BACKUP).importFromJson(json)).rejects.toMatchObject({
      code: 'batch.stale',
    });
    spy.mockRestore();
    expect(await dbB.select('SELECT id, name FROM vessels ORDER BY id')).toEqual(before);
  });
});
