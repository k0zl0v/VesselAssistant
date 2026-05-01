import { useState } from 'react';
import { confirm, open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { getDb } from '../db';
import { useT } from '../i18n';
import { BackupService } from '../services/BackupService';

const todayIso = (): string => {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export function BackupPanel() {
  const t = useT();
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
        title: t('backup.dialog.save_title'),
        defaultPath: defaultName,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;

      const db = await getDb();
      const json = await new BackupService(db).exportToJson();
      await writeTextFile(path, json);
      setInfo(t('backup.info.saved', { path }));
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
        title: t('backup.dialog.open_title'),
        multiple: false,
        directory: false,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!picked || typeof picked !== 'string') return;

      const proceed = await confirm(t('backup.confirm.import'), {
        title: t('backup.confirm.import_title'),
        kind: 'warning',
      });
      if (!proceed) return;

      const json = await readTextFile(picked);
      const db = await getDb();
      await new BackupService(db).importFromJson(json, { wipeFirst: true });

      const reload = await confirm(t('backup.confirm.reload'), {
        title: t('backup.confirm.reload_title'),
        kind: 'info',
      });
      if (reload) {
        window.location.reload();
      } else {
        setInfo(t('backup.info.import_done'));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="backup-panel">
      <h3>{t('backup.title')}</h3>
      <p className="hint">{t('backup.intro')}</p>
      <div className="actions">
        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={busy !== null}
        >
          {busy === 'export' ? t('backup.exporting') : t('backup.export')}
        </button>
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={busy !== null}
          className="secondary"
        >
          {busy === 'import' ? t('backup.importing') : t('backup.import')}
        </button>
      </div>
      {info && <p className="info">{info}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
