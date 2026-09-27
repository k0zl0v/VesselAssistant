import { useCallback, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { getDb } from '../../db';
import { useT } from '../../i18n';
import { describeError } from '../../i18n/errors';

export interface WorkbookExportTarget {
  voyage_id: string;
  voyage_no: string;
  vessel_name: string;
}

const sanitize = (s: string): string => s.replace(/[^A-Za-z0-9 _.-]/g, '_');

/** The one place the default export file name is built (ExportButton and the Documents screen). */
export function defaultExportFileName(vessel_name: string, voyage_no: string): string {
  return `Load Plan ${sanitize(vessel_name)} ${sanitize(voyage_no)}.xlsx`;
}

export interface WorkbookExport {
  busy: boolean;
  error: string | null;
  /** Path the last export of this session was written to; null until one succeeds. */
  savedPath: string | null;
  run: () => Promise<void>;
}

/** Save dialog → DocumentEngine → writeFile. Cancelling the dialog is not an error. */
export function useWorkbookExport({ voyage_id, voyage_no, vessel_name }: WorkbookExportTarget): WorkbookExport {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const path = await save({
        title: t('export.dialog.title'),
        defaultPath: defaultExportFileName(vessel_name, voyage_no),
        filters: [{ name: 'Excel', extensions: ['xlsx'] }],
      });
      if (!path) return;
      // Lazy-load DocumentEngine + ExcelJS so the initial bundle stays small.
      const [{ DocumentEngine }, db] = await Promise.all([import('../../services/DocumentEngine'), getDb()]);
      const bytes = await new DocumentEngine(db).generateLoadPlan(voyage_id);
      await writeFile(path, bytes);
      setSavedPath(path);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [t, voyage_id, voyage_no, vessel_name]);

  return { busy, error, savedPath, run };
}
