import { BaseDirectory, mkdir, readDir, remove, writeTextFile } from '@tauri-apps/plugin-fs';
import type { BackupStore } from './services/BackupStore';

const DIR = 'backups';
const APP_DATA = { baseDir: BaseDirectory.AppData };

/**
 * Automatic snapshots under `$APPDATA/backups` via plugin-fs. The capability scope in
 * `src-tauri/capabilities/default.json` covers exactly mkdir / read_dir / remove / write_text_file there.
 */
export class TauriBackupStore implements BackupStore {
  async write(name: string, json: string): Promise<void> {
    await mkdir(DIR, { ...APP_DATA, recursive: true });
    await writeTextFile(`${DIR}/${name}`, json, APP_DATA);
  }

  async list(): Promise<{ name: string }[]> {
    await mkdir(DIR, { ...APP_DATA, recursive: true });
    const entries = await readDir(DIR, APP_DATA);
    return entries.filter((e) => e.isFile).map((e) => ({ name: e.name }));
  }

  async remove(name: string): Promise<void> {
    await remove(`${DIR}/${name}`, APP_DATA);
  }
}
