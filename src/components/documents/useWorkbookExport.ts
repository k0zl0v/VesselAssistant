import { useCallback } from 'react';
import { useT } from '../../i18n';
import type { Db } from '../../services/db';
import type { DocumentRevision } from '../../services/DocumentRevisionService';
import { useRecordedExport, type RecordedExport } from './useRecordedExport';

export interface WorkbookExportTarget {
  voyage_id: string;
  voyage_no: string;
  vessel_name: string;
  onRecorded?: (revision: DocumentRevision) => void;
}

export const sanitizeFilePart = (s: string): string => s.replace(/[^A-Za-z0-9 _.-]/g, '_');

/** The one place the default export file name is built (ExportButton and the Documents screen). */
export function defaultExportFileName(vessel_name: string, voyage_no: string): string {
  return `Load Plan ${sanitizeFilePart(vessel_name)} ${sanitizeFilePart(voyage_no)}.xlsx`;
}

/** The Load Plan workbook (four sheets); every saved file becomes a `load_plan` revision. */
export function useWorkbookExport({ voyage_id, voyage_no, vessel_name, onRecorded }: WorkbookExportTarget): RecordedExport {
  const t = useT();
  const generate = useCallback(
    async (db: Db) => {
      // Lazy-load DocumentEngine + ExcelJS so the initial bundle stays small.
      const { DocumentEngine } = await import('../../services/DocumentEngine');
      return new DocumentEngine(db).generateLoadPlan(voyage_id);
    },
    [voyage_id],
  );
  return useRecordedExport({
    voyage_id,
    document_type: 'load_plan',
    dialogTitle: t('export.dialog.title'),
    defaultPath: defaultExportFileName(vessel_name, voyage_no),
    generate,
    onRecorded,
  });
}
