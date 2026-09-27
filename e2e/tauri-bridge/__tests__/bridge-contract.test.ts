/** @vitest-environment jsdom */
import { invoke, isTauri } from '@tauri-apps/api/core';
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import {
  BaseDirectory,
  exists,
  mkdir,
  readDir,
  readFile,
  readTextFile,
  remove,
  writeFile,
  writeTextFile,
} from '@tauri-apps/plugin-fs';
import { error as logError } from '@tauri-apps/plugin-log';
import Database from '@tauri-apps/plugin-sql';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TauriBackupStore } from '../../../src/backupStore';
import { reportError } from '../../../src/errorReporting';
import { AutoBackupService } from '../../../src/services/AutoBackupService';
import { TauriDb } from '../../../src/services/db-tauri';
import { isAppError } from '../../../src/services/errors';
import { tauriInitScript } from '../init-script';
import { BRIDGE_NAME } from '../install';
import { TauriBridgeHost } from '../node-side';

const DB_URL = 'sqlite:vessel_assistant.db';

/** Playwright's `exposeFunction` passes JSON-serialisable values only — the round trip here enforces the same. */
const wire = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

let host: TauriBridgeHost;

beforeEach(async () => {
  host = await TauriBridgeHost.create();
  (window as unknown as Record<string, unknown>)[BRIDGE_NAME] = async (cmd: string, args: unknown, options: unknown) =>
    wire(await host.dispatch(cmd, wire(args), wire(options)));
  tauriInitScript({ bridgeName: BRIDGE_NAME });
});

afterEach(() => {
  host.db.close();
});

async function rejection(p: Promise<unknown>): Promise<unknown> {
  return p.then(
    () => {
      throw new Error('expected a rejection');
    },
    (e: unknown) => e,
  );
}

describe('bridge contract — real @tauri-apps client code against TauriBridgeHost', () => {
  it('marks the page as a Tauri runtime', () => {
    expect(isTauri()).toBe(true);
  });

  it('plugin-sql: load / execute / select', async () => {
    const db = await Database.load(DB_URL);
    const result = await db.execute('INSERT INTO vessels (id, name) VALUES (?, ?)', ['v-1', 'NORD STAR']);
    expect(result).toEqual({ rowsAffected: 1, lastInsertId: 1 });
    expect(await db.select('SELECT id, name FROM vessels')).toEqual([{ id: 'v-1', name: 'NORD STAR' }]);
  });

  it('plugin-sql: a query against a database that was never loaded is refused', async () => {
    expect(await rejection(Database.get(DB_URL).select('SELECT 1'))).toBe(`database ${DB_URL} is not loaded`);
  });

  it('plugin-sql: booleans bind as JSON text, as tauri-plugin-sql does', async () => {
    const db = await Database.load(DB_URL);
    expect(await db.select('SELECT typeof(?) AS t, ? AS v', [true, true])).toEqual([{ t: 'text', v: 'true' }]);
  });

  it('TauriDb: execute, select and a rolled-back transaction', async () => {
    const db = await TauriDb.open();
    await db.execute('INSERT INTO vessels (id, name) VALUES (?, ?)', ['v-1', 'NORD STAR']);
    await expect(
      db.transaction(async (tx) => {
        await tx.execute('INSERT INTO vessels (id, name) VALUES (?, ?)', ['v-2', 'VELES']);
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(await db.select<{ id: string }>('SELECT id FROM vessels ORDER BY id')).toEqual([{ id: 'v-1' }]);
  });

  describe('TauriDb.executeBatch → execute_batch', () => {
    const seed = [
      "INSERT INTO vessels (id, name) VALUES ('v-1', 'NORD STAR')",
      "INSERT INTO holds (id, vessel_id, hold_no, volume_m3) VALUES ('h-1', 'v-1', 1, 100000)",
      "INSERT INTO voyages (id, vessel_id, voyage_no) VALUES ('voy-1', 'v-1', 'B-1')",
    ];
    const insertOp = (id: string) => ({
      sql: "INSERT INTO operations (id, voyage_id, type, event_date, tons) VALUES (?, 'voy-1', 'discharge', '2026-05-01', 1)",
      params: [id],
    });

    it('commits and returns rows affected', async () => {
      const db = await TauriDb.open();
      for (const sql of seed) await db.execute(sql);
      expect(await db.executeBatch([insertOp('op-1'), insertOp('op-2')])).toEqual([1, 1]);
      expect(await db.select('SELECT count(*) AS n FROM operations')).toEqual([{ n: 2 }]);
    });

    it('an SQL failure rolls back and surfaces the message', async () => {
      const db = await TauriDb.open();
      for (const sql of seed) await db.execute(sql);
      const err = await rejection(
        db.executeBatch([insertOp('op-1'), { sql: 'INSERT INTO operations (id) VALUES (?)', params: ['op-2'] }]),
      );
      expect(isAppError(err)).toBe(false);
      expect((err as Error).message).toMatch(/NOT NULL constraint failed/);
      expect(await db.select('SELECT count(*) AS n FROM operations')).toEqual([{ n: 0 }]);
    });

    it('a rows-affected mismatch becomes AppError batch.stale', async () => {
      const db = await TauriDb.open();
      for (const sql of seed) await db.execute(sql);
      const err = await rejection(
        db.executeBatch([
          insertOp('op-1'),
          { sql: "UPDATE voyages SET voyage_no = 'B-2' WHERE id = ?", params: ['missing'], expectRowsAffected: 1 },
        ]),
      );
      expect(isAppError(err) && [err.code, err.params]).toEqual(['batch.stale', { index: 1 }]);
      expect(await db.select('SELECT count(*) AS n FROM operations')).toEqual([{ n: 0 }]);
    });
  });

  it('plugin-fs: writeTextFile / readTextFile round-trip under AppData', async () => {
    await mkdir('backups', { baseDir: BaseDirectory.AppData, recursive: true });
    await writeTextFile('backups/auto-1.json', '{"ключ":"значение"}', { baseDir: BaseDirectory.AppData });
    expect(await readTextFile('backups/auto-1.json', { baseDir: BaseDirectory.AppData })).toBe('{"ключ":"значение"}');
    expect(host.fs.readText('$AppData/backups/auto-1.json')).toBe('{"ключ":"значение"}');
  });

  it('plugin-fs: writeTextFile / readTextFile round-trip on an absolute path', async () => {
    await writeTextFile('/Users/op/Documents/backup.json', '{"a":1}');
    expect(await readTextFile('/Users/op/Documents/backup.json')).toBe('{"a":1}');
  });

  it('plugin-fs: writeFile / readFile keep bytes intact', async () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255]);
    await writeFile('/tmp/plan.xlsx', bytes);
    expect(Array.from(await readFile('/tmp/plan.xlsx'))).toEqual([0, 1, 127, 128, 255]);
  });

  it('plugin-fs: writing into a missing AppData subdirectory fails like the real fs', async () => {
    expect(String(await rejection(writeTextFile('backups/x.json', '{}', { baseDir: BaseDirectory.AppData })))).toMatch(
      /no such directory \$AppData\/backups/,
    );
  });

  it('plugin-fs: mkdir / readDir / exists / remove', async () => {
    const opts = { baseDir: BaseDirectory.AppData };
    expect(await exists('backups', opts)).toBe(false);
    await mkdir('backups', { ...opts, recursive: true });
    await writeTextFile('backups/a.json', '1', opts);
    await writeTextFile('backups/b.json', '2', opts);
    expect((await readDir('backups', opts)).map((e) => [e.name, e.isFile, e.isDirectory]).sort()).toEqual([
      ['a.json', true, false],
      ['b.json', true, false],
    ]);
    await remove('backups/a.json', opts);
    expect(await exists('backups/a.json', opts)).toBe(false);
    expect(await exists('backups/b.json', opts)).toBe(true);
    expect(String(await rejection(remove('backups/a.json', opts)))).toMatch(/no such file/);
  });

  it('TauriBackupStore + TauriDb: an auto-backup lands in $AppData/backups and rotates', async () => {
    const db = await TauriDb.open();
    await db.execute("INSERT INTO vessels (id, name) VALUES ('v-1', 'NORD STAR')");
    let n = 0;
    const svc = new AutoBackupService(db, new TauriBackupStore(), () => new Date(Date.UTC(2026, 8, 27, 10, 0, n++)));

    const first = await svc.snapshot('close_voyage');
    expect(JSON.parse(host.fs.readText(`$AppData/backups/${first}`)!).tables.vessels).toEqual([
      { id: 'v-1', name: 'NORD STAR', flag: null, owner: null, imo: null, default_fill_percent: 0.98, created_at: expect.any(String), updated_at: expect.any(String) },
    ]);
    for (let i = 0; i < 10; i++) await svc.snapshot('timer');
    const files = [...host.fs.files.keys()].filter((k) => k.startsWith('$AppData/backups/'));
    expect(files).toHaveLength(10);
    expect(files).not.toContain(`$AppData/backups/${first}`);
  });

  it('plugin-dialog: save / open answer with the scripted path, confirm with the scripted button', async () => {
    host.dialogs.enqueue('save', '/Users/op/Downloads/plan.xlsx');
    host.dialogs.enqueue('open', '/Users/op/Downloads/in.xlsx');
    host.dialogs.enqueue('message', 'Ok');
    host.dialogs.enqueue('message', 'Cancel');
    expect(await save({ defaultPath: 'plan.xlsx' })).toBe('/Users/op/Downloads/plan.xlsx');
    expect(await open({ multiple: false })).toBe('/Users/op/Downloads/in.xlsx');
    expect(await confirm('Import?', { kind: 'warning' })).toBe(true);
    expect(await confirm('Import?', { kind: 'warning' })).toBe(false);
    expect(host.dialogs.shown.map((d) => d.kind)).toEqual(['save', 'open', 'message', 'message']);
    expect(host.dialogs.shown[2]!.args).toMatchObject({ message: 'Import?', kind: 'warning', buttons: 'OkCancel' });
  });

  it('plugin-dialog: an unscripted dialog fails instead of guessing an answer', async () => {
    expect(await rejection(save())).toBe('bridge: unscripted dialog save');
  });

  it('plugin-log: error() and the app reportError reach the host log', async () => {
    await logError('direct');
    await reportError('render', new Error('boom'));
    expect(host.logs.map((l) => l.level)).toEqual([5, 5]);
    expect(host.logs[0]!.message).toBe('direct');
    expect(host.logs[1]!.message).toMatch(/^\[render\] Error: boom/);
  });

  it('an unknown command is refused and recorded', async () => {
    expect(await rejection(invoke('plugin:shell|execute', { program: 'ls' }))).toBe('bridge: unhandled plugin:shell|execute');
    expect(host.unhandled).toEqual(['plugin:shell|execute']);
  });
});
