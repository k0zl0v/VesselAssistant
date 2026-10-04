import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeDb } from '../db-node';
import { DocumentRevisionService, exportAndRecord, fileNameOf } from '../DocumentRevisionService';
import { openTestDb, seedReferenceData, TEST_SESSION } from './helpers';

describe('DocumentRevisionService', () => {
  let db: NodeDb;
  let revisions: DocumentRevisionService;

  beforeEach(async () => {
    db = await openTestDb();
    revisions = new DocumentRevisionService(db);
    const seed = await seedReferenceData(db, { vesselName: 'NORD STAR', holdNos: [1] });
    await db.execute(`INSERT INTO voyages (id, vessel_id, voyage_no) VALUES ('voy-1', ?, 'V-1')`, [seed.vesselId]);
    await db.execute(`INSERT INTO voyages (id, vessel_id, voyage_no) VALUES ('voy-2', ?, 'V-2')`, [seed.vesselId]);
  });

  afterEach(() => {
    db.close();
  });

  const bytes = (n: number) => new Uint8Array(n);

  it('record() numbers revisions per (voyage, document type) and stamps the operator', async () => {
    const r1 = await revisions.record({
      voyage_id: 'voy-1',
      document_type: 'load_plan',
      file_path: '/exports/Load Plan NORD STAR V-1.xlsx',
      byte_size: 151_552,
      note: '  after OGV-0043 ',
    });
    const r2 = await revisions.record({
      voyage_id: 'voy-1',
      document_type: 'load_plan',
      file_path: 'C:\\Users\\op\\Documents\\plan-2.xlsx',
      byte_size: 10,
    });
    const audit = await revisions.record({ voyage_id: 'voy-1', document_type: 'audit_log', file_path: '/a.xlsx', byte_size: 1 });
    const other = await revisions.record({ voyage_id: 'voy-2', document_type: 'load_plan', file_path: '/b.xlsx', byte_size: 1 });

    expect(r1).toMatchObject({
      revision: 1,
      document_type: 'load_plan',
      file_name: 'Load Plan NORD STAR V-1.xlsx',
      local_file_path: '/exports/Load Plan NORD STAR V-1.xlsx',
      byte_size: 151_552,
      created_by: TEST_SESSION.operator_name,
      note: 'after OGV-0043',
      status: 'final',
    });
    expect(r1.generated_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(r2).toMatchObject({ revision: 2, file_name: 'plan-2.xlsx', note: null });
    expect(audit.revision).toBe(1);
    expect(other.revision).toBe(1);
  });

  it('list() returns the voyage revisions newest first', async () => {
    for (const kind of ['load_plan', 'audit_log', 'load_plan'] as const) {
      await revisions.record({ voyage_id: 'voy-1', document_type: kind, file_path: `/${kind}.xlsx`, byte_size: 1 });
    }
    await revisions.record({ voyage_id: 'voy-2', document_type: 'load_plan', file_path: '/x.xlsx', byte_size: 1 });

    const list = await revisions.list('voy-1');
    expect(list.map((r) => [r.document_type, r.revision])).toEqual([
      ['load_plan', 2],
      ['audit_log', 1],
      ['load_plan', 1],
    ]);
  });

  it('an insert is written to the audit log', async () => {
    const r = await revisions.record({ voyage_id: 'voy-1', document_type: 'load_plan', file_path: '/p.xlsx', byte_size: 5 });
    const rows = await db.select<{ action: string; user_id: string }>(
      `SELECT action, user_id FROM audit_log WHERE entity_type = 'documents' AND entity_id = ?`,
      [r.id],
    );
    expect(rows).toEqual([{ action: 'insert', user_id: TEST_SESSION.operator_name }]);
  });

  it('a closed voyage still records its exports', async () => {
    await db.execute(`UPDATE voyages SET status = 'closed' WHERE id = 'voy-1'`);
    const r = await revisions.record({ voyage_id: 'voy-1', document_type: 'audit_log', file_path: '/c.xlsx', byte_size: 2 });
    expect(r.revision).toBe(1);
  });

  it('fileNameOf() handles POSIX and Windows separators', () => {
    expect(fileNameOf('/a/b/c.xlsx')).toBe('c.xlsx');
    expect(fileNameOf('C:\\a\\d.xlsx')).toBe('d.xlsx');
    expect(fileNameOf('e.xlsx')).toBe('e.xlsx');
  });

  describe('exportAndRecord()', () => {
    const target = { voyage_id: 'voy-1', document_type: 'load_plan' as const };

    it('records the saved file with its byte size', async () => {
      const write = vi.fn(async () => undefined);
      const r = await exportAndRecord(db, target, {
        pickPath: async () => '/exports/plan.xlsx',
        generate: async () => bytes(4096),
        write,
      });
      expect(write).toHaveBeenCalledWith('/exports/plan.xlsx', expect.any(Uint8Array));
      expect(r).toMatchObject({ revision: 1, byte_size: 4096, file_name: 'plan.xlsx' });
      expect(await revisions.list('voy-1')).toHaveLength(1);
    });

    it('a cancelled save dialog records nothing and generates nothing', async () => {
      const generate = vi.fn(async () => bytes(1));
      const r = await exportAndRecord(db, target, { pickPath: async () => null, generate, write: async () => undefined });
      expect(r).toBeNull();
      expect(generate).not.toHaveBeenCalled();
      expect(await revisions.list('voy-1')).toEqual([]);
    });

    it('a failed write records nothing', async () => {
      await expect(
        exportAndRecord(db, target, {
          pickPath: async () => '/ro/plan.xlsx',
          generate: async () => bytes(1),
          write: async () => {
            throw new Error('forbidden path');
          },
        }),
      ).rejects.toThrow('forbidden path');
      expect(await revisions.list('voy-1')).toEqual([]);
    });

    it('a failed generation records nothing', async () => {
      const write = vi.fn(async () => undefined);
      await expect(
        exportAndRecord(db, target, {
          pickPath: async () => '/p.xlsx',
          generate: async () => {
            throw new Error('boom');
          },
          write,
        }),
      ).rejects.toThrow('boom');
      expect(write).not.toHaveBeenCalled();
      expect(await revisions.list('voy-1')).toEqual([]);
    });
  });
});
