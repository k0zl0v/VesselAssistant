import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { getDb } from '../db';
import { useT } from '../i18n';
import { describeError } from '../i18n/errors';

interface Props {
  voyage_id: string;
  voyage_no: string;
  vessel_name: string;
}

const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9 _.-]/g, '_');

export function AuditExportButton({ voyage_id, voyage_no, vessel_name }: Props) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const defaultName = `Audit Log ${sanitize(vessel_name)} ${sanitize(voyage_no)}.xlsx`;
      const path = await save({
        title: t('audit.export.dialog.title'),
        defaultPath: defaultName,
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (!path) {
        return;
      }
      const [{ DocumentEngine }, db] = await Promise.all([
        import('../services/DocumentEngine'),
        getDb(),
      ]);
      const bytes = await new DocumentEngine(db).generateAuditLog(voyage_id);
      await writeFile(path, bytes);
    } catch (e) {
      setError(describeError(e));
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
        data-testid="audit-export"
      >
        {busy ? t('audit.export.exporting') : t('audit.export.button')}
      </button>
      {error && <span className="error inline">{error}</span>}
    </>
  );
}
