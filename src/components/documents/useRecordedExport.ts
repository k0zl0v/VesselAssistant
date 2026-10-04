import { useCallback, useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { getDb } from '../../db';
import { describeError } from '../../i18n/errors';
import type { Db } from '../../services/db';
import { exportAndRecord, type DocumentKind, type DocumentRevision } from '../../services/DocumentRevisionService';

export interface RecordedExportOptions {
  voyage_id: string;
  document_type: DocumentKind;
  dialogTitle: string;
  defaultPath: string;
  /** Called only after the dialog was confirmed; lazy-import DocumentEngine inside. */
  generate: (db: Db) => Promise<Uint8Array>;
  /** Fires after the revision row is written. */
  onRecorded?: (revision: DocumentRevision) => void;
}

export interface RecordedExport {
  busy: boolean;
  error: string | null;
  /** The revision this hook recorded last; null until one succeeds. */
  revision: DocumentRevision | null;
  run: () => Promise<void>;
}

/** Save dialog → generate → writeFile → `documents` row. Cancelling the dialog is not an error. */
export function useRecordedExport(opts: RecordedExportOptions): RecordedExport {
  const { voyage_id, document_type, dialogTitle, defaultPath, generate, onRecorded } = opts;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState<DocumentRevision | null>(null);

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const db = await getDb();
      const recorded = await exportAndRecord(
        db,
        { voyage_id, document_type },
        {
          pickPath: () =>
            save({ title: dialogTitle, defaultPath, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }),
          generate: () => generate(db),
          write: (path, bytes) => writeFile(path, bytes),
        },
      );
      if (recorded) {
        setRevision(recorded);
        onRecorded?.(recorded);
      }
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  }, [voyage_id, document_type, dialogTitle, defaultPath, generate, onRecorded]);

  return { busy, error, revision, run };
}
