import { reportError } from '../errorReporting';
import type { BackupStore } from './BackupStore';
import { dumpAllTables } from './BackupService';
import type { Db } from './db';
import { AppError } from './errors';

export type AutoBackupTrigger = 'close_voyage' | 'import_excel' | 'import_project' | 'restore' | 'timer';

/** What mutating services call before an irreversible action (FR-14). */
export interface AutoBackupHook {
  snapshot(trigger: AutoBackupTrigger): Promise<string | void>;
}

export const AUTO_BACKUP_KEEP = 10;
export const AUTO_BACKUP_INTERVAL_MS = 30 * 60 * 1000;

export interface IntervalTimers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const GLOBAL_TIMERS: IntervalTimers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (handle) => globalThis.clearInterval(handle as ReturnType<typeof globalThis.setInterval>),
};

const AUTO_NAME = /^auto-.+\.json$/;

export class AutoBackupService implements AutoBackupHook {
  private lastSnapshotAuditId: number | null = null;

  constructor(
    private readonly db: Db,
    private readonly store: BackupStore,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Writes `auto-<iso>-<trigger>.json` and rotates to the newest `AUTO_BACKUP_KEEP`; resolves to the file name. */
  async snapshot(trigger: AutoBackupTrigger): Promise<string> {
    try {
      const at = this.clock();
      const auditId = await this.maxAuditId();
      const json = await dumpAllTables(this.db, at);
      // ':' and '.' are not allowed in Windows file names; the name still sorts chronologically.
      const name = `auto-${at.toISOString().replace(/[:.]/g, '-')}-${trigger}.json`;
      await this.store.write(name, json);
      this.lastSnapshotAuditId = auditId;
      await this.rotate();
      return name;
    } catch (e) {
      throw new AppError('backup.failed', { message: e instanceof Error ? e.message : String(e) });
    }
  }

  async hasChangesSinceSnapshot(): Promise<boolean> {
    const current = await this.maxAuditId();
    if (current === null) return false;
    return this.lastSnapshotAuditId === null || current > this.lastSnapshotAuditId;
  }

  /** Every `AUTO_BACKUP_INTERVAL_MS`: snapshot if audit_log grew. Failures go to `onError`, never thrown. */
  startTimer(
    timers: IntervalTimers = GLOBAL_TIMERS,
    onError: (e: unknown) => void = (e) => void reportError('auto-backup', e),
  ): () => void {
    const tick = async (): Promise<void> => {
      try {
        if (await this.hasChangesSinceSnapshot()) await this.snapshot('timer');
      } catch (e) {
        onError(e);
      }
    };
    const handle = timers.setInterval(tick, AUTO_BACKUP_INTERVAL_MS);
    return () => timers.clearInterval(handle);
  }

  private async maxAuditId(): Promise<number | null> {
    const rows = await this.db.select<{ id: number | null }>(`SELECT MAX(id) AS id FROM audit_log`);
    return rows[0]?.id ?? null;
  }

  private async rotate(): Promise<void> {
    const names = (await this.store.list())
      .map((f) => f.name)
      .filter((n) => AUTO_NAME.test(n))
      .sort();
    for (const name of names.slice(0, Math.max(0, names.length - AUTO_BACKUP_KEEP))) {
      await this.store.remove(name);
    }
  }
}
