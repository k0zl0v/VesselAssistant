/**
 * Database abstraction. Two implementations:
 *  - db-tauri.ts → @tauri-apps/plugin-sql (production, runs in webview)
 *  - db-node.ts  → node:sqlite (integration tests, runs under Vitest)
 *
 * Services depend on this interface and do not import either impl directly.
 * Parameters use SQLite '?' positional placeholders for compatibility with both.
 */

export type SqlValue = string | number | boolean | null;

export interface Db {
  /** INSERT / UPDATE / DELETE / DDL. */
  execute(sql: string, params?: SqlValue[]): Promise<void>;
  /** SELECT returning typed rows. */
  select<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  /** Run `fn` inside an IMMEDIATE transaction. Rolls back on throw. */
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}
