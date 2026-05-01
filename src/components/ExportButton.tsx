import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { getDb } from '../db';
import { useT } from '../i18n';

interface Props {
  voyage_id: string;
  voyage_no: string;
  vessel_name: string;
}

const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9 _.-]/g, '_');

export function ExportButton({ voyage_id, voyage_no, vessel_name }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const defaultName = `Load Plan ${sanitize(vessel_name)} ${sanitize(voyage_no)}.xlsx`;
      const path = await save({
        title: t('export.dialog.title'),
        defaultPath: defaultName,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (!path) {
        return;
      }
      // Lazy-load DocumentEngine + ExcelJS so the initial bundle stays small.
      const [{ DocumentEngine }, db] = await Promise.all([
        import('../services/DocumentEngine'),
        getDb(),
      ]);
      const bytes = await new DocumentEngine(db).generateLoadPlan(voyage_id);
      await writeFile(path, bytes);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy}
        className="secondary"
      >
        {busy ? t('export.exporting') : t('export.button')}
      </button>
      {error && <span className="error inline">{error}</span>}
    </>
  );
}
