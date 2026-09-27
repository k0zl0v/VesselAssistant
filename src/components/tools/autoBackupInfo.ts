import type { BackupStore } from '../../services/BackupStore';
import type { AutoBackupTrigger } from '../../services/AutoBackupService';

export interface AutoBackupFile {
  name: string;
  at: Date;
  trigger: AutoBackupTrigger | null;
}

export interface AutoBackupSummary {
  count: number;
  latest: AutoBackupFile | null;
}

const TRIGGERS: readonly AutoBackupTrigger[] = ['close_voyage', 'import_excel', 'import_project', 'restore', 'timer'];

/** Inverse of the name `AutoBackupService.snapshot` writes: `auto-<iso with - for : and .>-<trigger>.json`. */
export function parseAutoBackupName(name: string): AutoBackupFile | null {
  const m = /^auto-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-(.+)\.json$/.exec(name);
  if (!m) return null;
  const at = new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
  if (Number.isNaN(at.getTime())) return null;
  const trigger = (TRIGGERS as readonly string[]).includes(m[6]!) ? (m[6] as AutoBackupTrigger) : null;
  return { name, at, trigger };
}

/** Read-only look at the automatic snapshots; the store is the one `AutoBackupService` writes to. */
export async function summarizeAutoBackups(store: BackupStore): Promise<AutoBackupSummary> {
  const files = (await store.list())
    .map((f) => parseAutoBackupName(f.name))
    .filter((f): f is AutoBackupFile => f !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  return { count: files.length, latest: files[files.length - 1] ?? null };
}

/** `27.09.2026 14:05` in local time. */
export function formatLocalDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
