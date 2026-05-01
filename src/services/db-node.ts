import BetterSqlite3 from 'better-sqlite3';
import type { Db, SqlValue } from './db';

type Handle = ReturnType<typeof BetterSqlite3>;

/**
 * Vitest-only Db implementation backed by better-sqlite3.
 * Do NOT import this from app code — it's not available in the webview.
 */
export class NodeDb implements Db {
  constructor(private readonly handle: Handle) {
    handle.pragma('foreign_keys = ON');
  }

  static openInMemory(): NodeDb {
    return new NodeDb(new BetterSqlite3(':memory:'));
  }

  async execute(sql: string, params: SqlValue[] = []): Promise<void> {
    if (params.length === 0) {
      this.handle.exec(sql);
    } else {
      this.handle.prepare(sql).run(...this.coerce(params));
    }
  }

  async select<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    const stmt = this.handle.prepare(sql);
    return stmt.all(...this.coerce(params)) as T[];
  }

  async transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
    this.handle.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn(this);
      this.handle.exec('COMMIT');
      return result;
    } catch (e) {
      this.handle.exec('ROLLBACK');
      throw e;
    }
  }

  close(): void {
    this.handle.close();
  }

  private coerce(params: SqlValue[]): (string | number | bigint | null)[] {
    return params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
  }
}
