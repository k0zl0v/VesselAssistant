import Database from '@tauri-apps/plugin-sql';
import type { Db, SqlValue } from './db';

/**
 * Production Db implementation backed by @tauri-apps/plugin-sql.
 * Connection is opened once and reused; migrations are applied by the
 * Rust side at startup (see src-tauri/src/lib.rs).
 */
export class TauriDb implements Db {
  private constructor(private readonly handle: Database) {}

  static async open(): Promise<TauriDb> {
    const db = await Database.load('sqlite:vessel_assistant.db');
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
}
