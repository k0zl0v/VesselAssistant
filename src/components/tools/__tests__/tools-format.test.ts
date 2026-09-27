import { describe, expect, it } from 'vitest';
import { THIN_NBSP } from '../../../calc/round';
import { MemoryBackupStore } from '../../../services/BackupStore';
import { auditChanges, formatAuditTime, formatAuditValue, shortId } from '../auditFormat';
import { parseAutoBackupName, summarizeAutoBackups } from '../autoBackupInfo';
import { fileName, summarizeBackupFile } from '../backupFile';

describe('auditChanges', () => {
  it('update keeps only fields whose displayed value changed, tons via formatTons', () => {
    const changes = auditChanges({
      action: 'update',
      old_value: JSON.stringify({ id: 'x', remaining_tons: 4082, hold_no: 1, layer_status: 'active', sf: 1.44 }),
      new_value: JSON.stringify({ id: 'x', remaining_tons: 2905.0000001, hold_no: 1, layer_status: 'partial', sf: 1.4400001 }),
    });
    expect(changes).toEqual([
      { field: 'remaining_tons', before: `4${THIN_NBSP}082.000`, after: `2${THIN_NBSP}905.000` },
      { field: 'layer_status', before: 'active', after: 'partial' },
    ]);
  });

  it('insert lists non-empty new values without id; delete lists the old ones', () => {
    const snapshot = JSON.stringify({ id: 'x', loaded_tons: 500, bl_no: null, source_vessel: 'A' });
    expect(auditChanges({ action: 'insert', old_value: null, new_value: snapshot })).toEqual([
      { field: 'loaded_tons', before: null, after: '500.000' },
      { field: 'source_vessel', before: null, after: 'A' },
    ]);
    expect(auditChanges({ action: 'delete', old_value: snapshot, new_value: null })).toEqual([
      { field: 'loaded_tons', before: '500.000', after: null },
      { field: 'source_vessel', before: 'A', after: null },
    ]);
  });

  it('survives malformed JSON', () => {
    expect(auditChanges({ action: 'update', old_value: '{oops', new_value: null })).toEqual([]);
  });

  it('counters stay integers', () => {
    expect(formatAuditValue('load_sequence', 3)).toBe('3');
    expect(formatAuditValue('tons', 3)).toBe('3.000');
  });
});

describe('audit display helpers', () => {
  it('shortens UUIDs only', () => {
    expect(shortId('0b8a3c1e-1111-2222-3333-444455556666')).toBe('0b8a3c1e');
    expect(shortId('42')).toBe('42');
  });

  it('formats SQLite UTC time as local DD.MM.YYYY HH:MM:SS', () => {
    const local = new Date(Date.UTC(2026, 8, 27, 10, 5, 7));
    const pad = (n: number) => String(n).padStart(2, '0');
    const expected = `${pad(local.getDate())}.${pad(local.getMonth() + 1)}.${local.getFullYear()} ${pad(local.getHours())}:05:07`;
    expect(formatAuditTime('2026-09-27 10:05:07')).toBe(expected);
    expect(formatAuditTime('garbage')).toBe('garbage');
  });
});

describe('auto backups', () => {
  it('parses the names AutoBackupService writes', () => {
    const f = parseAutoBackupName('auto-2026-09-27T10-05-07-123Z-close_voyage.json');
    expect(f?.trigger).toBe('close_voyage');
    expect(f?.at.toISOString()).toBe('2026-09-27T10:05:07.123Z');
    expect(parseAutoBackupName('manual.json')).toBeNull();
  });

  it('summarizes count and the newest snapshot, ignoring foreign files', async () => {
    const store = new MemoryBackupStore();
    await store.write('auto-2026-09-27T10-00-00-000Z-timer.json', '{}');
    await store.write('auto-2026-09-27T11-00-00-000Z-restore.json', '{}');
    await store.write('notes.txt', '');
    const s = await summarizeAutoBackups(store);
    expect(s.count).toBe(2);
    expect(s.latest?.trigger).toBe('restore');
  });
});

describe('summarizeBackupFile', () => {
  it('counts voyages, lots and operations of an envelope', () => {
    const json = JSON.stringify({
      schema_version: 2,
      exported_at: '2026-09-24T12:00:00.000Z',
      tables: { voyages: [{}], cargo_lots: [{}, {}], operations: [] },
    });
    expect(summarizeBackupFile(json)).toEqual({
      exportedAt: new Date('2026-09-24T12:00:00.000Z'),
      voyages: 1,
      lots: 2,
      operations: 0,
    });
  });

  it('rejects anything that is not an envelope', () => {
    expect(summarizeBackupFile('not json')).toBeNull();
    expect(summarizeBackupFile('{"tables":{}}')).toBeNull();
    expect(summarizeBackupFile('[]')).toBeNull();
  });

  it('fileName takes the last segment of either separator', () => {
    expect(fileName('C:\\Users\\op\\b.json')).toBe('b.json');
    expect(fileName('/tmp/x/b.json')).toBe('b.json');
  });
});
