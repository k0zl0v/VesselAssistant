import { TauriBackupStore } from './backupStore';
import { getDb } from './db';
import { AutoBackupService } from './services/AutoBackupService';

let cached: Promise<AutoBackupService> | null = null;

/** Lazy singleton over the app DB; `startTimer()` on it is called once, after the session gate. */
export function getAutoBackup(): Promise<AutoBackupService> {
  if (!cached) {
    cached = getDb().then((db) => new AutoBackupService(db, new TauriBackupStore()));
  }
  return cached;
}
