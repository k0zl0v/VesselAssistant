import { invoke } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import type { BatchStatement, Db, SqlValue } from './db';
import { AppError } from './errors';

const DB_URL = 'sqlite:vessel_assistant.db';

/** Serialized `BatchError` from src-tauri/src/batch.rs (serde's externally tagged enum). */
type BatchErrorPayload =
  | { Sql: { index: number; message: string } }
  | { RowsAffectedMismatch: { index: number; expected: number; actual: number } };

function toBatchError(raw: unknown): Error {
  const text = typeof raw === 'string' ? raw : String(raw);
  let payload: BatchErrorPayload;
  try {
    payload = JSON.parse(text) as BatchErrorPayload;
  } catch {
    return new Error(text);
  }
  if (payload && typeof payload === 'object') {
    if ('RowsAffectedMismatch' in payload) {
      return new AppError('batch.stale', { index: payload.RowsAffectedMismatch.index });
    }
    if ('Sql' in payload) return new Error(payload.Sql.message);
  }
  return new Error(text);
}

/**
 * Production Db implementation backed by @tauri-apps/plugin-sql.
 * Connection is opened once and reused; migrations are applied by the
 * Rust side at startup (see src-tauri/src/lib.rs).
 */
export class TauriDb implements Db {
  private constructor(private readonly handle: Database) {}

  static async open(): Promise<TauriDb> {
    const db = await Database.load(DB_URL);
    return new TauriDb(db);
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<void> {
    await this.handle.execute(sql, params);
  }

  async select<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return await this.handle.select<T[]>(sql, params);
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    await this.handle.execute('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      await this.handle.execute('COMMIT');
      return result;
    } catch (e) {
      await this.handle.execute('ROLLBACK');
      throw e;
    }
  }

  async executeBatch(batch: BatchStatement[]): Promise<number[]> {
    const payload = batch.map((s) => ({
      sql: s.sql,
      params: s.params,
      expect_rows_affected: s.expectRowsAffected ?? null,
    }));
    try {
      const result = await invoke<{ rows_affected: number[] }>('execute_batch', {
        db: DB_URL,
        batch: payload,
      });
      return result.rows_affected;
    } catch (e) {
      throw toBatchError(e);
    }
  }
}
