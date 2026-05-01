import { TauriDb } from './services/db-tauri';
import type { Db } from './services/db';

let cached: Promise<Db> | null = null;

/** Lazy singleton — opens the SQLite connection on first call. */
export function getDb(): Promise<Db> {
  if (!cached) {
    cached = TauriDb.open();
  }
  return cached;
}
