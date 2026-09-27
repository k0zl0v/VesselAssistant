import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTO_BACKUP_INTERVAL_MS,
  AUTO_BACKUP_KEEP,
  AutoBackupService,
  type IntervalTimers,
} from '../AutoBackupService';
import { BackupService } from '../BackupService';
import { MemoryBackupStore, type BackupStore } from '../BackupStore';
import type { NodeDb } from '../db-node';
import { isAppError } from '../errors';
import { NOOP_AUTO_BACKUP, openTestDb, seedReferenceData } from './helpers';

const T0 = Date.parse('2026-09-27T10:15:30.123Z');

/** A clock that advances one second per call, so consecutive snapshots get distinct names. */
function steppingClock(): () => Date {
  let n = 0;
  return () => new Date(T0 + 1000 * n++);
}

function withoutExportedAt(json: string): unknown {
  const { exported_at: _ignored, ...rest } = JSON.parse(json) as Record<string, unknown>;
  return rest;
}

function fakeTimers(): IntervalTimers & { tick: () => Promise<void>; intervals: number[]; cleared: unknown[] } {
  let handler: (() => void | Promise<void>) | null = null;
  const intervals: number[] = [];
  const cleared: unknown[] = [];
  return {
    intervals,
    cleared,
    setInterval(fn, ms) {
      handler = fn;
      intervals.push(ms);
      return 42;
    },
    clearInterval(handle) {
      cleared.push(handle);
    },
    async tick() {
      await handler?.();
    },
  };
}

describe('AutoBackupService', () => {
  let db: NodeDb;
  let store: MemoryBackupStore;

  beforeEach(async () => {
    db = await openTestDb();
    store = new MemoryBackupStore();
  });

  afterEach(() => {
    db.close();
  });

  it('snapshot writes auto-<iso>-<trigger>.json with the exportToJson content', async () => {
    await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1, 2] });
    const svc = new AutoBackupService(db, store, () => new Date(T0));

    const name = await svc.snapshot('close_voyage');

    expect(name).toBe('auto-2026-09-27T10-15-30-123Z-close_voyage.json');
    expect((await store.list()).map((f) => f.name)).toEqual([name]);
    const written = store.files.get(name)!;
    expect(JSON.parse(written).exported_at).toBe('2026-09-27T10:15:30.123Z');
    expect(withoutExportedAt(written)).toEqual(withoutExportedAt(await new BackupService(db, NOOP_AUTO_BACKUP).exportToJson()));
  });

  it(`keeps the newest ${AUTO_BACKUP_KEEP} snapshots and removes the oldest`, async () => {
    const svc = new AutoBackupService(db, store, steppingClock());
    const names: string[] = [];
    for (let i = 0; i < 11; i++) names.push(await svc.snapshot('timer'));

    const left = (await store.list()).map((f) => f.name).sort();
    expect(left).toHaveLength(10);
    expect(left).toEqual(names.slice(1));
    expect(left).not.toContain(names[0]);
  });

  it('rotation ignores files that are not auto-*.json', async () => {
    await store.write('manual-copy.json', '{}');
    const svc = new AutoBackupService(db, store, steppingClock());
    for (let i = 0; i < 11; i++) await svc.snapshot('timer');
    expect((await store.list()).map((f) => f.name)).toContain('manual-copy.json');
  });

  it('a failing store surfaces as AppError backup.failed', async () => {
    const broken: BackupStore = {
      write: async () => {
        throw new Error('disk full');
      },
      list: async () => [],
      remove: async () => undefined,
    };
    const svc = new AutoBackupService(db, broken, steppingClock());

    const err = await svc.snapshot('restore').then(
      () => null,
      (e: unknown) => e,
    );
    expect(isAppError(err) && err.code).toBe('backup.failed');
    expect(isAppError(err) && err.params).toEqual({ message: 'disk full' });
  });

  it('hasChangesSinceSnapshot tracks audit_log growth after the last snapshot', async () => {
    const svc = new AutoBackupService(db, store, steppingClock());
    expect(await svc.hasChangesSinceSnapshot()).toBe(false);

    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    await db.execute(`INSERT INTO voyages (id, vessel_id, voyage_no) VALUES ('voy-1', ?, 'V-1')`, [seed.vesselId]);
    expect(await svc.hasChangesSinceSnapshot()).toBe(true);

    await svc.snapshot('timer');
    expect(await svc.hasChangesSinceSnapshot()).toBe(false);
  });

  it('the timer snapshots exactly once after a mutation', async () => {
    const svc = new AutoBackupService(db, store, steppingClock());
    const timers = fakeTimers();
    const stop = svc.startTimer(timers, vi.fn());
    expect(timers.intervals).toEqual([AUTO_BACKUP_INTERVAL_MS]);

    await timers.tick();
    expect(await store.list()).toEqual([]);

    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    await db.execute(`INSERT INTO voyages (id, vessel_id, voyage_no) VALUES ('voy-1', ?, 'V-1')`, [seed.vesselId]);
    await timers.tick();
    await timers.tick();

    const names = (await store.list()).map((f) => f.name);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^auto-.+-timer\.json$/);

    stop();
    expect(timers.cleared).toEqual([42]);
  });

  it('a timer failure goes to onError and does not throw outward', async () => {
    const broken: BackupStore = {
      write: async () => {
        throw new Error('disk full');
      },
      list: async () => [],
      remove: async () => undefined,
    };
    const svc = new AutoBackupService(db, broken, steppingClock());
    const onError = vi.fn();
    const timers = fakeTimers();
    svc.startTimer(timers, onError);
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    await db.execute(`INSERT INTO voyages (id, vessel_id, voyage_no) VALUES ('voy-1', ?, 'V-1')`, [seed.vesselId]);

    await expect(timers.tick()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(isAppError(onError.mock.calls[0]![0]) && onError.mock.calls[0]![0].code).toBe('backup.failed');
  });
});
