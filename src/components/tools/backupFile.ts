/** What the restore confirmation shows about a picked file before anything is replaced. */
export interface BackupFileSummary {
  exportedAt: Date | null;
  voyages: number;
  lots: number;
  operations: number;
}

/** Null when the text is not a backup envelope at all; schema checks stay in `BackupService`. */
export function summarizeBackupFile(json: string): BackupFileSummary | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const env = parsed as { schema_version?: unknown; exported_at?: unknown; tables?: unknown };
  if (typeof env.schema_version !== 'number' || !env.tables || typeof env.tables !== 'object') return null;
  const tables = env.tables as Record<string, unknown>;
  const count = (name: string) => (Array.isArray(tables[name]) ? (tables[name] as unknown[]).length : 0);
  const at = typeof env.exported_at === 'string' ? new Date(env.exported_at) : null;
  return {
    exportedAt: at && !Number.isNaN(at.getTime()) ? at : null,
    voyages: count('voyages'),
    lots: count('cargo_lots'),
    operations: count('operations'),
  };
}

/** Last path segment, for «Restore from backup.json?» — the full path goes into `title`. */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() || path;
}
