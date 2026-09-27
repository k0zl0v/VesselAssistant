import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BatchStatement, SqlValue } from '../db';
import type { NodeDb } from '../db-node';
import { isAppError } from '../errors';
import rawCases from './fixtures/batch-cases.json';
import { openTestDb } from './helpers';

/** Shared with src-tauri/tests/batch.rs — the JSON keeps the Rust (snake_case) field names. */
interface BatchCase {
  name: string;
  setup_sql: string[];
  batch: { sql: string; params: SqlValue[]; expect_rows_affected?: number }[];
  expect: 'ok' | 'error';
  rows_affected?: number[];
  error?: { kind: 'Sql' | 'RowsAffectedMismatch'; index: number };
  assert_sql: string;
  assert_rows: Record<string, SqlValue>[];
}

const cases = rawCases as BatchCase[];

describe('NodeDb.executeBatch — shared batch-cases.json', () => {
  let db: NodeDb;

  beforeEach(async () => {
    db = await openTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('fixture covers one commit and two rollback cases', () => {
    expect(cases.map((c) => c.expect)).toEqual(['ok', 'error', 'error']);
  });

  it.each(cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    for (const sql of c.setup_sql) await db.execute(sql);
    const batch: BatchStatement[] = c.batch.map((s) => ({
      sql: s.sql,
      params: s.params,
      expectRowsAffected: s.expect_rows_affected,
    }));

    if (c.expect === 'ok') {
      expect(await db.executeBatch(batch)).toEqual(c.rows_affected);
    } else {
      const err: unknown = await db.executeBatch(batch).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(Error);
      if (c.error!.kind === 'RowsAffectedMismatch') {
        expect(isAppError(err) && err.code).toBe('batch.stale');
        expect(isAppError(err) && err.params).toEqual({ index: c.error!.index });
      } else {
        expect(isAppError(err)).toBe(false);
        expect((err as Error).message).toMatch(/FOREIGN KEY constraint failed/);
      }
    }

    expect(await db.select(c.assert_sql)).toEqual(c.assert_rows);
  });
});
