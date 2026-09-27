/**
 * Database abstraction. Two implementations:
 *  - db-tauri.ts → @tauri-apps/plugin-sql (production, runs in webview)
 *  - db-node.ts  → better-sqlite3 (integration tests, runs under Vitest)
 *
 * Services depend on this interface and do not import either impl directly.
 * Parameters use SQLite '?' positional placeholders for compatibility with both.
 */

export type SqlValue = string | number | boolean | null;

export interface BatchStatement {
  sql: string;
  params: SqlValue[];
  /** When set, a different `changes` count aborts the batch with `AppError('batch.stale')`. */
  expectRowsAffected?: number;
}

export interface Db {
  /** INSERT / UPDATE / DELETE / DDL. */
  execute(sql: string, params?: SqlValue[]): Promise<void>;
  /** SELECT returning typed rows. */
  select<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Run `fn` inside an IMMEDIATE transaction. Rolls back on throw. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
  /**
   * All statements on one connection in one IMMEDIATE transaction; any failure — full rollback.
   * Resolves to the rows affected by each statement, in order.
   */
  executeBatch(batch: BatchStatement[]): Promise<number[]>;
}
