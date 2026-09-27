/** Where automatic snapshots live. Prod: `TauriBackupStore` (`src/backupStore.ts`) under `$APPDATA/backups`. */
export interface BackupStore {
  write(name: string, json: string): Promise<void>;
  list(): Promise<{ name: string }[]>;
  remove(name: string): Promise<void>;
}

/** In-memory store for Vitest and the e2e bridge host. */
export class MemoryBackupStore implements BackupStore {
  readonly files = new Map<string, string>();

  async write(name: string, json: string): Promise<void> {
    this.files.set(name, json);
  }

  async list(): Promise<{ name: string }[]> {
    return [...this.files.keys()].map((name) => ({ name }));
  }

  async remove(name: string): Promise<void> {
    this.files.delete(name);
  }
}
