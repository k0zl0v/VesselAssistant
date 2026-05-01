import { useState } from 'react';
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { getDb } from '../db';
import { BackupService } from '../services/BackupService';

const todayIso = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function BackupPanel() {
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setBusy('export');
    setError(null);
    setInfo(null);
    try {
      const defaultName = `vessel-assistant-backup-${todayIso()}.json`;
      const path = await save({
        title: 'Save backup',
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;

      const db = await getDb();
      const json = await new BackupService(db).exportToJson();
      await writeTextFile(path, json);
      setInfo(`Backup saved to ${path}`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function handleImport(): Promise<void> {
    setBusy('import');
    setError(null);
    setInfo(null);
    try {
      const picked = await open({
        title: 'Open backup',
        multiple: false,
        directory: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!picked || typeof picked !== 'string') return;

      const proceed = await confirm(
        'Importing this backup will WIPE all current project data and replace it with the backup contents. This cannot be undone. Continue?',
        { title: 'Confirm import', kind: 'warning' },
      );
      if (!proceed) return;

      const json = await readTextFile(picked);
      const db = await getDb();
      await new BackupService(db).importFromJson(json, { wipeFirst: true });

      const reload = await confirm(
        'Import complete. The app must reload to refresh in-memory state. Reload now?',
        { title: 'Reload app', kind: 'info' },
      );
      if (reload) {
        window.location.reload();
      } else {
        setInfo('Import complete. Reload the app to see imported data.');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="backup-panel">
      <h3>Backup &amp; restore</h3>
      <p className="hint">
        Export the entire project (all voyages, lots, layers, SOF events,
        documents, audit log) to a single JSON file. Import replaces the
        current project state.
      </p>
      <div className="actions">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy !== null}
        >
          {busy === 'export' ? 'Exporting…' : 'Export backup'}
        </button>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={busy !== null}
          className="secondary"
        >
          {busy === 'import' ? 'Importing…' : 'Import backup'}
        </button>
      </div>
      {info && <p className="info">{info}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
